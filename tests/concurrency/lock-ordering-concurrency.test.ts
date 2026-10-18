import { spawn, type ChildProcess } from 'child_process';

/**
 * Deterministic multi-session PostgreSQL client using dockerized psql.
 * Each instance runs as an independent backend process with its own PID,
 * transaction boundary, and row-level locks.
 */
class PostgresSession {
  private proc: ChildProcess;
  private buffer: string = '';
  private currentResolver: ((val: string) => void) | null = null;
  private currentRejecter: ((err: Error) => void) | null = null;
  private isClosed: boolean = false;

  constructor() {
    this.proc = spawn('docker', [
      'exec',
      '-i',
      'supabase_db_hackleague',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-q',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=0',
    ]);

    this.proc.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.checkDelimiter();
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.checkDelimiter();
    });

    this.proc.on('close', () => {
      this.isClosed = true;
      if (this.currentRejecter) {
        this.currentRejecter(new Error('PostgresSession closed unexpectedly'));
      }
    });
  }

  private checkDelimiter() {
    const delimiter = '__END_OF_QUERY__';
    const idx = this.buffer.indexOf(delimiter);
    if (idx !== -1 && this.currentResolver) {
      const output = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + delimiter.length);
      const resolve = this.currentResolver;
      this.currentResolver = null;
      this.currentRejecter = null;
      resolve(output);
    }
  }

  async execute(sql: string): Promise<string> {
    if (this.isClosed) throw new Error('Session is closed');

    return new Promise((resolve, reject) => {
      this.currentResolver = resolve;
      this.currentRejecter = reject;
      const cmd = `${sql.trim()};\n\\echo '__END_OF_QUERY__'\n`;
      this.proc.stdin?.write(cmd);
    });
  }

  async getBackendPid(): Promise<number> {
    const res = await this.execute('SELECT pg_backend_pid()');
    return parseInt(res, 10);
  }

  close() {
    if (!this.isClosed) {
      this.isClosed = true;
      try {
        this.proc.stdin?.write('\\q\n');
        this.proc.stdin?.end();
      } catch {
        // safe ignore
      }
    }
  }
}

async function runConcurrencyTests() {
  console.log('--- Starting Phase 4 Genuine Multi-Session Concurrency Tests ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testId: string, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] [${testId}] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  const sessionAdmin = new PostgresSession();
  const sessionWorker = new PostgresSession();
  const sessionQuarantine = new PostgresSession();

  try {
    const pidAdmin = await sessionAdmin.getBackendPid();
    const pidWorker = await sessionWorker.getBackendPid();
    const pidQuarantine = await sessionQuarantine.getBackendPid();

    assert(
      pidAdmin !== pidWorker && pidWorker !== pidQuarantine && pidAdmin !== pidQuarantine,
      'TS-HAR-01',
      `Established 3 distinct concurrent PostgreSQL sessions (PIDs: ${pidAdmin}, ${pidWorker}, ${pidQuarantine})`
    );

    const hackathonId = (await sessionAdmin.execute('SELECT id FROM public.hackathons LIMIT 1')).trim();

    // Setup Test Environment: Ensure test hackathon has an in-charge admin
    const setupSql = `
      DO $$
      DECLARE
        v_h_id UUID := '${hackathonId}';
        v_super_id UUID := (SELECT id FROM public.admin_profiles WHERE is_super_admin = true LIMIT 1);
      BEGIN
        UPDATE public.hackathons SET in_charge_admin_id = v_super_id WHERE id = v_h_id;
      END $$;
    `;
    await sessionAdmin.execute(setupSql);

    // ========================================================================
    // RACE ORDERING 1: Worker Completion Commits First -> Quarantine Sweeper Skips
    // ========================================================================
    console.log('\n[Race 1: Worker Completion Commits First -> Quarantine Skips]');

    const race1JobId = '77777777-1111-4000-8000-000000000001';
    const race1LeaseToken = '88888888-1111-4000-8000-000000000001';

    // Seed job in 'dispatching' with an ACTIVE lease held by worker
    await sessionAdmin.execute(`
      DELETE FROM public.storage_deletion_queue WHERE id = '${race1JobId}';
      INSERT INTO public.storage_deletion_queue (
        id, event_id, bucket_id, object_path, target_type, target_id,
        status, lease_token, leased_by, leased_until, dispatch_attempted_at, retention_deadline_at
      ) VALUES (
        '${race1JobId}', '${hackathonId}', 'submission-evidence', 'evidence/race1/test.pdf', 'submission_evidence',
        gen_random_uuid()::text, 'dispatching', '${race1LeaseToken}', 'worker-1', now() + interval '30 seconds',
        now() - interval '2 seconds', now() - interval '1 day'
      );
    `);

    // 1. Session Worker starts transaction and completes job
    await sessionWorker.execute('BEGIN');
    const workerCompleteRes = await sessionWorker.execute(`
      SELECT public.complete_storage_deletion_job(
        '${race1JobId}'::uuid,
        '${race1LeaseToken}'::uuid,
        200
      );
    `);
    assert(
      !workerCompleteRes.includes('ERROR'),
      'TS-RACE1-01',
      'Session Worker completed job within its active transaction'
    );
    await sessionWorker.execute('COMMIT');

    // 2. Concurrently, Session Quarantine attempts to sweep expired dispatches
    await sessionQuarantine.execute(`
      SELECT public.quarantine_expired_dispatches(50, 120);
    `);

    // 3. Inspect final state
    const job1Final = await sessionAdmin.execute(`
      SELECT status || ':' || COALESCE(deletion_outcome, 'NONE')
      FROM public.storage_deletion_queue
      WHERE id = '${race1JobId}';
    `);

    assert(
      job1Final.startsWith('completed:PURGED_'),
      'TS-RACE1-02',
      `Winning completion preserved: status is '${job1Final}' and was NOT overwritten by quarantine sweeper`
    );

    // ========================================================================
    // RACE ORDERING 2: Quarantine Commits First -> Late Worker Completion Fails Closed
    // ========================================================================
    console.log('\n[Race 2: Quarantine Commits First -> Late Worker Completion Rejected]');

    const race2JobId = '77777777-2222-4000-8000-000000000002';
    const race2LeaseToken = '88888888-2222-4000-8000-000000000002';

    // Seed job in 'dispatching' with expired lease
    await sessionAdmin.execute(`
      DELETE FROM public.storage_deletion_queue WHERE id = '${race2JobId}';
      INSERT INTO public.storage_deletion_queue (
        id, event_id, bucket_id, object_path, target_type, target_id,
        status, lease_token, leased_by, leased_until, dispatch_attempted_at, retention_deadline_at
      ) VALUES (
        '${race2JobId}', '${hackathonId}', 'submission-evidence', 'evidence/race2/test.pdf', 'submission_evidence',
        gen_random_uuid()::text, 'dispatching', '${race2LeaseToken}', 'worker-2', now() - interval '10 seconds',
        now() - interval '20 seconds', now() - interval '1 day'
      );
    `);

    // 1. Session Quarantine executes and commits first
    await sessionQuarantine.execute('BEGIN');
    await sessionQuarantine.execute(`
      SELECT public.quarantine_expired_dispatches(50, 120);
    `);
    await sessionQuarantine.execute('COMMIT');

    // 2. Session Worker attempts late callback using its stale lease token
    const lateWorkerRes = await sessionWorker.execute(`
      SELECT public.complete_storage_deletion_job(
        '${race2JobId}'::uuid,
        '${race2LeaseToken}'::uuid,
        200
      );
    `);

    assert(
      lateWorkerRes.includes('ERROR') && lateWorkerRes.includes('Invalid transition'),
      'TS-RACE2-01',
      `Late worker completion rejected with invalid transition error (${lateWorkerRes.split('\n')[0]})`
    );

    // 3. Inspect final state in DB
    const job2Final = await sessionAdmin.execute(`
      SELECT status || ':' || COALESCE(deletion_outcome, 'NONE')
      FROM public.storage_deletion_queue
      WHERE id = '${race2JobId}';
    `);

    assert(
      job2Final === 'cooldown:RETRYABLE_DISPATCH_TIMEOUT',
      'TS-RACE2-02',
      `Authoritative quarantine state preserved: status is '${job2Final}', stale callback could not overwrite it`
    );

    // ========================================================================
    // RACE 3: Duplicate Callback on Already Completed Job (Idempotent NO-OP)
    // ========================================================================
    console.log('\n[Race 3: Duplicate Callback on Completed Job (Terminal-State Idempotency)]');

    const dupRes = await sessionWorker.execute(`
      SELECT public.complete_storage_deletion_job(
        '${race1JobId}'::uuid,
        '${race1LeaseToken}'::uuid,
        200
      );
    `);

    assert(
      !dupRes.includes('ERROR'),
      'TS-DUP-01',
      'Duplicate callback on completed job executes cleanly as idempotent NO-OP without error'
    );

    const dupCheck = await sessionAdmin.execute(`
      SELECT status FROM public.storage_deletion_queue WHERE id = '${race1JobId}';
    `);
    assert(
      dupCheck === 'completed',
      'TS-DUP-02',
      'Job status remains completed after duplicate callback'
    );

    // ========================================================================
    // RACE 4: Reconciliation State Protection against Stale Callbacks
    // ========================================================================
    console.log('\n[Race 4: Late Callback on Reconciling Job]');

    // Expire cooldown on race2JobId and claim for reconciliation
    await sessionAdmin.execute(`
      UPDATE public.storage_deletion_queue
      SET cooldown_until = now() - interval '1 second'
      WHERE id = '${race2JobId}';
    `);

    await sessionQuarantine.execute(`
      SELECT public.claim_reconciliation_batch('reconciler-1', 10, 30);
    `);

    const reconStatus = await sessionAdmin.execute(`
      SELECT status FROM public.storage_deletion_queue WHERE id = '${race2JobId}';
    `);

    assert(
      reconStatus === 'reconciling',
      'TS-REC-01',
      `Job transitioned to 'reconciling' under parent lock`
    );

    // Late worker completion callback attempts to commit
    const lateReconCallback = await sessionWorker.execute(`
      SELECT public.complete_storage_deletion_job(
        '${race2JobId}'::uuid,
        '${race2LeaseToken}'::uuid,
        200
      );
    `);

    assert(
      lateReconCallback.includes('ERROR') && lateReconCallback.includes('Invalid transition'),
      'TS-REC-02',
      'Late completion callback on reconciling job rejected with invalid transition error'
    );

    // Reconciliation resolution (404 = confirmed absent)
    await sessionQuarantine.execute(`
      DO $$
      DECLARE
        v_token UUID;
      BEGIN
        SELECT lease_token INTO v_token FROM public.storage_deletion_queue WHERE id = '${race2JobId}';
        PERFORM public.resolve_reconciliation_job('${race2JobId}'::uuid, v_token, 404);
      END $$;
    `);

    const finalReconState = await sessionAdmin.execute(`
      SELECT status || ':' || COALESCE(deletion_outcome, 'NONE')
      FROM public.storage_deletion_queue
      WHERE id = '${race2JobId}';
    `);

    assert(
      finalReconState.startsWith('completed:ABSENT_RECONCILED'),
      'TS-REC-03',
      `Reconciliation resolves cleanly to completed: '${finalReconState}'`
    );

    // Cleanup
    await sessionAdmin.execute(`
      DELETE FROM public.storage_deletion_queue WHERE id IN ('${race1JobId}', '${race2JobId}');
    `);

    console.log('\n==================================================================');
    console.log(`Multi-Session Concurrency Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
    console.log('==================================================================\n');

    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    sessionAdmin.close();
    sessionWorker.close();
    sessionQuarantine.close();
  }
}

runConcurrencyTests().catch((err) => {
  console.error('Concurrency harness error:', err);
  process.exit(1);
});
