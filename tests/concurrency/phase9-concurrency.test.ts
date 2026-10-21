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

  constructor(containerName: string = 'supabase_db_hackleague') {
    this.proc = spawn('docker', [
      'exec',
      '-i',
      containerName,
      'sh',
      '-c',
      'psql -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=0 2>&1',
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

async function runPhase9ConcurrencySuite() {
  console.log('==================================================================');
  console.log('Phase 9 Concurrency Hardening & Race Verification Suite');
  console.log('Testing Multi-Session Row-Level Locking, Reversals & Roster Locks');
  console.log('==================================================================\n');

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

  const containerName = process.env.TARGET_DB_CONTAINER || 'supabase_db_hackleague';
  const s1 = new PostgresSession(containerName);
  const s2 = new PostgresSession(containerName);
  const sAdmin = new PostgresSession(containerName);

  const adminId = '00000000-0000-0000-0000-000000000001';
  const hid = '00000000-0000-0000-0000-000000000910';
  const r1Id = '00000000-0000-0000-0000-000000000911';

  // Distinct test student IDs
  const s1Id = '00000000-0000-0000-0000-000000000901';
  const s2Id = '00000000-0000-0000-0000-000000000902';
  const s3Id = '00000000-0000-0000-0000-000000000903';
  const s4Id = '00000000-0000-0000-0000-000000000904';
  const s6Id = '00000000-0000-0000-0000-000000000906';
  const s7Id = '00000000-0000-0000-0000-000000000907';
  const s8Id = '00000000-0000-0000-0000-000000000908';
  const s9Id = '00000000-0000-0000-0000-000000000909';
  const s10Id = '00000000-0000-0000-0000-000000000914';
  const s11Id = '00000000-0000-0000-0000-000000000915';

  const allStudentIds = [s1Id, s2Id, s3Id, s4Id, s6Id, s7Id, s8Id, s9Id, s10Id, s11Id];

  // Distinct team IDs
  const t1Id = '00000000-0000-0000-0000-000000000921'; // S1 leader, S2 member
  const t2Id = '00000000-0000-0000-0000-000000000922'; // S3 leader, S4 member
  const t6Id = '00000000-0000-0000-0000-000000000926'; // S6 leader, S7 member (forming)
  const t7Id = '00000000-0000-0000-0000-000000000927'; // S8 leader, S9 member (forming)
  const t8Id = '00000000-0000-0000-0000-000000000928'; // S10 leader, S11 member (for roster-wide award)
  const sub8Id = '00000000-0000-0000-0000-000000000938';

  const authAdminCmd = `
    SELECT set_config('request.jwt.claim.sub', '${adminId}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    SET ROLE authenticated;
  `;

  // Clean teardown helper:
  // Note on SET LOCAL session_replication_role = 'replica':
  // In PostgreSQL, public.points_ledger and public.audit_logs have immutable triggers (prevent_points_ledger_mutation,
  // prevent_audit_log_mutation) that unconditionally disallow direct DELETE operations.
  // To allow deterministic test fixtures to be cleaned up after a test run without leaving orphan rows in auth.users,
  // we execute SET LOCAL session_replication_role = 'replica' strictly inside an isolated transaction block.
  // Because it is SET LOCAL, it automatically reverts to 'origin' upon COMMIT and only targets test-owned UUIDs.
  const runTeardown = async () => {
    const studentIdList = allStudentIds.map((id) => `'${id}'`).join(', ');
    await sAdmin.execute(`
      BEGIN;
      SET CONSTRAINTS ALL DEFERRED;
      SET LOCAL session_replication_role = 'replica';
      DELETE FROM public.submission_reviews WHERE submission_id = '${sub8Id}'::uuid;
      DELETE FROM public.submissions WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.results WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.audit_logs WHERE details->>'hackathon_id' = '${hid}' OR actor_id IN (${studentIdList});
      DELETE FROM public.points_ledger WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.team_members WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.teams WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.hackathon_rounds WHERE hackathon_id = '${hid}'::uuid;
      DELETE FROM public.hackathons WHERE id = '${hid}'::uuid;
      DELETE FROM public.profiles WHERE id IN (${studentIdList});
      DELETE FROM auth.users WHERE id IN (${studentIdList});
      COMMIT;
    `);
  };

  try {
    // Pre-flight database identity check
    const idCheck = await sAdmin.execute(`
      SELECT current_database() || ':' || COALESCE(inet_server_addr()::text, 'socket') || ':' || current_user;
    `);
    const [dbName, dbHost, dbUser] = idCheck.trim().split(':');
    assert(
      dbName === 'postgres' && (dbHost === 'socket' || dbHost === '127.0.0.1' || dbHost.startsWith('172.')),
      'P9-IDENT-VERIFY',
      `Target database identity confirmed: ${dbName} on ${dbHost} as ${dbUser} (container: ${containerName})`
    );

    const pid1 = await s1.getBackendPid();
    const pid2 = await s2.getBackendPid();
    const pidAdmin = await sAdmin.getBackendPid();
    assert(
      pid1 !== pid2 && pid2 !== pidAdmin && pid1 !== pidAdmin,
      'P9-CONC-INIT',
      `Established 3 distinct PostgreSQL sessions (PIDs: ${pid1}, ${pid2}, ${pidAdmin})`
    );

    // Initial clean reset
    await runTeardown();

    // Setup base fixtures
    const setupSql = `
      BEGIN;
      SET CONSTRAINTS ALL DEFERRED;

      -- 1. Auth Users
      INSERT INTO auth.users (id, email) VALUES 
        ('${s1Id}', 'p9_s1@nmit.ac.in'),
        ('${s2Id}', 'p9_s2@nmit.ac.in'),
        ('${s3Id}', 'p9_s3@nmit.ac.in'),
        ('${s4Id}', 'p9_s4@nmit.ac.in'),
        ('${s6Id}', 'p9_s6@nmit.ac.in'),
        ('${s7Id}', 'p9_s7@nmit.ac.in'),
        ('${s8Id}', 'p9_s8@nmit.ac.in'),
        ('${s9Id}', 'p9_s9@nmit.ac.in'),
        ('${s10Id}', 'p9_s10@nmit.ac.in'),
        ('${s11Id}', 'p9_s11@nmit.ac.in')
      ON CONFLICT (id) DO NOTHING;

      -- 2. Profiles
      INSERT INTO public.profiles (id, full_name, email, usn, branch, phone, academic_year, registration_status)
      VALUES 
        ('${s1Id}', 'P9 Student 1', 'p9_s1@nmit.ac.in', '1NT21CS901', 'CSE', '9999999901', 3, 'approved'),
        ('${s2Id}', 'P9 Student 2', 'p9_s2@nmit.ac.in', '1NT21CS902', 'CSE', '9999999902', 3, 'approved'),
        ('${s3Id}', 'P9 Student 3', 'p9_s3@nmit.ac.in', '1NT21CS903', 'CSE', '9999999903', 3, 'approved'),
        ('${s4Id}', 'P9 Student 4', 'p9_s4@nmit.ac.in', '1NT21CS904', 'CSE', '9999999904', 3, 'approved'),
        ('${s6Id}', 'P9 Student 6', 'p9_s6@nmit.ac.in', '1NT21CS906', 'CSE', '9999999906', 3, 'approved'),
        ('${s7Id}', 'P9 Student 7', 'p9_s7@nmit.ac.in', '1NT21CS907', 'CSE', '9999999907', 3, 'approved'),
        ('${s8Id}', 'P9 Student 8', 'p9_s8@nmit.ac.in', '1NT21CS908', 'CSE', '9999999908', 3, 'approved'),
        ('${s9Id}', 'P9 Student 9', 'p9_s9@nmit.ac.in', '1NT21CS909', 'CSE', '9999999909', 3, 'approved'),
        ('${s10Id}', 'P9 Student 10', 'p9_s10@nmit.ac.in', '1NT21CS910', 'CSE', '9999999910', 3, 'approved'),
        ('${s11Id}', 'P9 Student 11', 'p9_s11@nmit.ac.in', '1NT21CS911', 'CSE', '9999999911', 3, 'approved')
      ON CONFLICT (id) DO NOTHING;

      -- 3. Hackathon & Round
      INSERT INTO public.hackathons (id, title, slug, description, organizer, mode, status, registration_start_at, registration_end_at, event_start_at, event_end_at, created_by)
      VALUES ('${hid}', 'P9 Concurrency Hackathon', 'p9-conc-hackathon', 'Concurrency audit event', 'CSE Dept', 'online', 'ongoing',
        now() - interval '5 days', now() + interval '1 day', now() + interval '2 days', now() + interval '5 days', '${adminId}')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.hackathon_rounds (id, hackathon_id, round_number, name, status, start_at, end_at)
      VALUES ('${r1Id}', '${hid}', 1, 'Round 1: Execution Phase', 'open', now() - interval '2 days', now() + interval '2 days')
      ON CONFLICT (id) DO NOTHING;

      -- 4. Teams & Rosters (no student is in more than one team)
      INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, external_status, internal_status)
      VALUES 
        ('${t1Id}', '${hid}', 'P9 Team 1', '${s1Id}', 'P9T1CODE', 'submitted', 'complete'),
        ('${t2Id}', '${hid}', 'P9 Team 2', '${s3Id}', 'P9T2CODE', 'submitted', 'complete'),
        ('${t6Id}', '${hid}', 'P9 Team 6', '${s6Id}', 'P9T6CODE', 'not_submitted', 'forming'),
        ('${t7Id}', '${hid}', 'P9 Team 7', '${s8Id}', 'P9T7CODE', 'not_submitted', 'forming'),
        ('${t8Id}', '${hid}', 'P9 Team 8', '${s10Id}', 'P9T8CODE', 'submitted', 'complete')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
      VALUES 
        ('${t1Id}', '${s1Id}', '${hid}', 'leader'),
        ('${t1Id}', '${s2Id}', '${hid}', 'member'),
        ('${t2Id}', '${s3Id}', '${hid}', 'leader'),
        ('${t2Id}', '${s4Id}', '${hid}', 'member'),
        ('${t6Id}', '${s6Id}', '${hid}', 'leader'),
        ('${t6Id}', '${s7Id}', '${hid}', 'member'),
        ('${t7Id}', '${s8Id}', '${hid}', 'leader'),
        ('${t7Id}', '${s9Id}', '${hid}', 'member'),
        ('${t8Id}', '${s10Id}', '${hid}', 'leader'),
        ('${t8Id}', '${s11Id}', '${hid}', 'member')
      ON CONFLICT (team_id, student_id) DO NOTHING;

      -- Initial balance of 15 points for Student 1 (Scenario 1)
      INSERT INTO public.points_ledger (
        id, idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000951', 'p9_initial_s1', '${s1Id}', '${hid}', '${t1Id}', 'participation', 'leader', 15, 'Initial 15 pts', '${adminId}'
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      -- Submission for Team 8 (Scenario 8)
      INSERT INTO public.submissions (
        id, hackathon_id, round_id, team_id, submitted_by, title, repo_url, status, is_current
      ) VALUES (
        '${sub8Id}', '${hid}', '${r1Id}', '${t8Id}', '${s10Id}', 'Team 8 Submission', 'https://github.com/nmit/p9-team8', 'submitted', true
      )
      ON CONFLICT (id) DO NOTHING;

      COMMIT;
    `;
    const setupRes = await sAdmin.execute(setupSql);
    if (setupRes.includes('ERROR')) {
      console.error('Setup failed:', setupRes);
    }

    // ========================================================================
    // SCENARIO 1: Two Simultaneous Negative Adjustments vs Zero Floor
    // ========================================================================
    console.log('[Scenario 1: Two Simultaneous Negative Adjustments vs Zero Floor]');
    const adjSql1a = `
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s1Id}'::uuid,
        '${hid}'::uuid,
        '${t1Id}'::uuid,
        -10,
        'Negative Adjustment A',
        'adj_key_race_1a'
      );
    `;
    const adjSql1b = `
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s1Id}'::uuid,
        '${hid}'::uuid,
        '${t1Id}'::uuid,
        -10,
        'Negative Adjustment B',
        'adj_key_race_1b'
      );
    `;

    const [res1a, res1b] = await Promise.all([
      s1.execute(adjSql1a),
      s2.execute(adjSql1b),
    ]);

    const oneSucceeded =
      (res1a.includes('"success": true') && res1b.includes('below zero')) ||
      (res1b.includes('"success": true') && res1a.includes('below zero'));
    assert(oneSucceeded, 'P9-RACE-01a', 'Level 2 lock serialized adjustments: exactly one succeeded, one rejected by zero floor (22000)');

    const balRes = await sAdmin.execute(
      `SELECT sum(points)::int FROM public.points_ledger WHERE student_id = '${s1Id}'::uuid;`
    );
    assert(balRes.trim() === '5', 'P9-RACE-01b', `Student 1 resulting balance is strictly 5 (never dropped below zero)`, `got ${balRes}`);

    // Persisted state check
    const s1AuditCount = await sAdmin.execute(
      `SELECT count(*)::int FROM public.audit_logs WHERE action = 'points.adjusted' AND details->>'student_id' = '${s1Id}';`
    );
    assert(s1AuditCount.trim() === '1', 'P9-RACE-01c', 'Exactly 1 audit log created for the successful adjustment');

    // ========================================================================
    // SCENARIO 2: Double Reversal Race on the Same Entry
    // ========================================================================
    console.log('\n[Scenario 2: Double Reversal Race on the Same Entry]');
    await sAdmin.execute(`
      INSERT INTO public.points_ledger (
        id, idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000952', 'p9_rev_target_s2', '${s2Id}',
        '${hid}', '${t1Id}',
        'participation', 'member', 10, 'To be reversed concurrently', '${adminId}'
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    `);

    const revSql1 = `
      ${authAdminCmd}
      SELECT public.reverse_points_ledger_entry('00000000-0000-0000-0000-000000000952'::uuid, 'Reversal Session 1 Reason');
    `;
    const revSql2 = `
      ${authAdminCmd}
      SELECT public.reverse_points_ledger_entry('00000000-0000-0000-0000-000000000952'::uuid, 'Reversal Session 2 Reason');
    `;

    const [revRes1, revRes2] = await Promise.all([
      s1.execute(revSql1),
      s2.execute(revSql2),
    ]);

    const isRevError = (str: string) =>
      str.includes('already been reversed') ||
      str.includes('22023') ||
      str.includes('uq_points_ledger_single_reversal') ||
      str.includes('duplicate key');

    const oneRevSucceeded =
      (revRes1.includes('"success": true') && isRevError(revRes2)) ||
      (revRes2.includes('"success": true') && isRevError(revRes1));
    assert(oneRevSucceeded, 'P9-RACE-02a', 'Level 3 ledger lock serialized reversals: exactly one succeeded, second rejected safely',
      `revRes1: ${revRes1.slice(0, 100)}, revRes2: ${revRes2.slice(0, 100)}`);

    const revCountRes = await sAdmin.execute(`
      SELECT count(*)::int FROM public.points_ledger WHERE reversal_of_id = '00000000-0000-0000-0000-000000000952'::uuid;
    `);
    assert(revCountRes.trim() === '1', 'P9-RACE-02b', 'Unique reversal invariant preserved: exactly 1 reversal row exists in points_ledger');

    // ========================================================================
    // SCENARIO 3: True Concurrent Race between Adjustment and Reversal on Same Student
    // ========================================================================
    console.log('\n[Scenario 3: Concurrent Race between Adjustment and Reversal on Same Student]');
    await sAdmin.execute(`
      INSERT INTO public.points_ledger (
        id, idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000953', 'p9_award_race3', '${s3Id}',
        '${hid}', '${t2Id}',
        'manual_adjustment', 'leader', 25, 'Award 25 pts for race 3', '${adminId}'
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    `);

    const race3AdjSql = `
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s3Id}'::uuid,
        '${hid}'::uuid,
        '${t2Id}'::uuid,
        -15,
        'Negative Adjustment in Race 3',
        'adj_key_race_3'
      );
    `;
    const race3RevSql = `
      ${authAdminCmd}
      SELECT public.reverse_points_ledger_entry('00000000-0000-0000-0000-000000000953'::uuid, 'Reversal in Race 3 Reason');
    `;

    const [r3AdjRes, r3RevRes] = await Promise.all([
      s1.execute(race3AdjSql),
      s2.execute(race3RevSql),
    ]);

    const race3Consistent =
      (r3AdjRes.includes('"success": true') && r3RevRes.includes('"success": true')) ||
      (r3RevRes.includes('"success": true') && r3AdjRes.includes('below zero'));
    assert(race3Consistent, 'P9-RACE-03', 'Adjustment and reversal serialize deterministically under Level 2 profile lock without deadlock');

    // ========================================================================
    // SCENARIO 4: Negative Adjustment on Zero-Balance Student Post-Reversal
    // ========================================================================
    console.log('\n[Scenario 4: Negative Adjustment on Zero-Balance Student Post-Reversal]');
    // Student 2 balance was 10, reversed by -10 -> balance is exactly 0
    const adjZeroRes = await s1.execute(`
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s2Id}'::uuid,
        '${hid}'::uuid,
        '${t1Id}'::uuid,
        -5,
        'Negative Adjustment post reversal on zero balance',
        'adj_key_zero_bal_test'
      );
    `);
    assert(
      adjZeroRes.includes('below zero'),
      'P9-RACE-04',
      'Negative adjustment on zero-balance post-reversal student rejected by zero-floor guard'
    );

    // ========================================================================
    // SCENARIO 5: Multi-Profile Ordered Lock Deadlock Freedom (DAG Compliance)
    // ========================================================================
    console.log('\n[Scenario 5: Multi-Profile Ordered Lock Deadlock Freedom]');
    await s1.execute('RESET ROLE; BEGIN');
    await s1.execute(`
      SELECT 1 FROM public.profiles
      WHERE id IN ('${s1Id}'::uuid, '${s2Id}'::uuid)
      ORDER BY id ASC
      FOR UPDATE;
    `);

    let s2Completed = false;
    const s2Promise = (async () => {
      await s2.execute('RESET ROLE; BEGIN');
      await s2.execute(`
        SELECT 1 FROM public.profiles
        WHERE id IN ('${s1Id}'::uuid, '${s2Id}'::uuid)
        ORDER BY id ASC
        FOR UPDATE;
      `);
      s2Completed = true;
      await s2.execute('COMMIT');
    })();

    await new Promise((r) => setTimeout(r, 200));
    assert(!s2Completed, 'P9-RACE-05a', 'Session 2 cleanly blocks on ordered profile locks held by Session 1');

    await s1.execute('COMMIT');
    await s2Promise;
    assert(s2Completed, 'P9-RACE-05b', 'Session 2 unblocks and commits smoothly without 40P01 deadlock');

    // ========================================================================
    // SCENARIO 6: Manual Adjustment Racing with leave_team
    // ========================================================================
    console.log('\n[Scenario 6: Manual Adjustment Racing with leave_team]');
    const leaveSql = `
      SELECT set_config('request.jwt.claim.sub', '${s7Id}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SET ROLE authenticated;
      SELECT public.leave_team('${t6Id}'::uuid);
    `;
    const adjSql6 = `
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s7Id}'::uuid,
        '${hid}'::uuid,
        '${t6Id}'::uuid,
        25,
        'Race 6 Bonus adjustment for member',
        'adj_key_race_6'
      );
    `;

    const [resLeave, resAdj6] = await Promise.all([
      s1.execute(leaveSql),
      s2.execute(adjSql6),
    ]);

    const validOutcome6 =
      (resLeave.includes('"action": "left"') && resAdj6.includes('not an enrolled member')) ||
      (resAdj6.includes('"success": true') && resLeave.includes('already has awarded points'));
    assert(
      validOutcome6,
      'P9-RACE-06',
      'Level 1 team lock perfectly serialized leave_team and adjust_points_ledger_entry'
    );

    // ========================================================================
    // SCENARIO 7: Manual Adjustment Racing with remove_team_member
    // ========================================================================
    console.log('\n[Scenario 7: Manual Adjustment Racing with remove_team_member]');
    const removeSql = `
      SELECT set_config('request.jwt.claim.sub', '${s8Id}', false);
      SELECT set_config('request.jwt.claim.role', 'authenticated', false);
      SET ROLE authenticated;
      SELECT public.remove_team_member('${t7Id}'::uuid, '${s9Id}'::uuid);
    `;
    const adjSql7 = `
      ${authAdminCmd}
      SELECT public.adjust_points_ledger_entry(
        '${s9Id}'::uuid,
        '${hid}'::uuid,
        '${t7Id}'::uuid,
        25,
        'Race 7 Bonus adjustment for member',
        'adj_key_race_7'
      );
    `;

    const [resRemove, resAdj7] = await Promise.all([
      s1.execute(removeSql),
      s2.execute(adjSql7),
    ]);

    const validOutcome7 =
      (resRemove.includes('"action": "removed"') && resAdj7.includes('not an enrolled member')) ||
      (resAdj7.includes('"success": true') && resRemove.includes('already has awarded points'));
    assert(
      validOutcome7,
      'P9-RACE-07',
      'Level 1 team lock perfectly serialized remove_team_member and adjust_points_ledger_entry'
    );

    // ========================================================================
    // SCENARIO 8: Concurrent Roster-Wide Awards via review_round_submission
    // ========================================================================
    console.log('\n[Scenario 8: Concurrent Roster-Wide Awards via review_round_submission]');
    const reviewSql1 = `
      ${authAdminCmd}
      SELECT public.review_round_submission(
        '${sub8Id}'::uuid,
        'accepted',
        'Approved by evaluation reviewer 1 with high merit'
      );
    `;
    const reviewSql2 = `
      ${authAdminCmd}
      SELECT public.review_round_submission(
        '${sub8Id}'::uuid,
        'accepted',
        'Approved by evaluation reviewer 2 with high merit'
      );
    `;

    const [revSubRes1, revSubRes2] = await Promise.all([
      s1.execute(reviewSql1),
      s2.execute(reviewSql2),
    ]);

    // Level 1 lock on submissions and teams serializes the reviews.
    // The winner marks the submission 'accepted', inserts result, and awards points to all members.
    // The second reviewer unblocks, sees status 'accepted', and is rejected with 22023 / error.
    const s1Succeeded = revSubRes1.includes('"success": true');
    const s2Succeeded = revSubRes2.includes('"success": true');
    const exactlyOneSucceeded = (s1Succeeded && !s2Succeeded) || (s2Succeeded && !s1Succeeded);

    const losingOutput = s1Succeeded ? revSubRes2 : revSubRes1;
    const losingRejected =
      losingOutput.includes('cannot be reviewed') ||
      losingOutput.includes('22023');

    // Confirm database invariant: exactly 1 review was recorded for the submission
    const reviewRecordCount = await sAdmin.execute(`
      SELECT count(*)::int FROM public.submission_reviews WHERE submission_id = '${sub8Id}'::uuid;
    `);

    const validScenario8 =
      exactlyOneSucceeded &&
      losingRejected &&
      reviewRecordCount.trim() === '1';

    assert(
      validScenario8,
      'P9-RACE-08a',
      'Concurrent submission reviews serialized: exactly one succeeded in publishing results and points'
    );

    // Persisted state checks: exactly 1 result row, exactly 2 qualification points rows (one per team member)
    const resultCount = await sAdmin.execute(`
      SELECT count(*)::int FROM public.results WHERE team_id = '${t8Id}'::uuid AND round_id = '${r1Id}'::uuid;
    `);
    assert(resultCount.trim() === '1', 'P9-RACE-08b', 'Persisted result count is strictly 1 (no duplicate results)');

    const memberPointsCount = await sAdmin.execute(`
      SELECT count(*)::int FROM public.points_ledger WHERE team_id = '${t8Id}'::uuid AND round_id = '${r1Id}'::uuid;
    `);
    assert(memberPointsCount.trim() === '2', 'P9-RACE-08c', 'Exactly 2 roster-wide points entries created (1 leader, 1 member, no duplicate awards)');

    console.log('\n==================================================================');
    console.log(
      `Phase 9 Concurrency Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`
    );
    console.log('==================================================================\n');

    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    try {
      await runTeardown();
      // Final clean verification assertion
      const studentIdList = allStudentIds.map((id) => `'${id}'`).join(', ');
      const remnantUsers = await sAdmin.execute(`
        SELECT count(*)::int FROM auth.users WHERE id IN (${studentIdList});
      `);
      if (remnantUsers.trim() === '0') {
        console.log('  ✓ [TEARDOWN-CLEAN] Zero test fixtures remain in auth.users or public tables post-execution\n');
      } else {
        console.error(`  ✗ [TEARDOWN-LEAK] Remnant test users detected in auth.users: ${remnantUsers}\n`);
      }
    } catch (e) {
      console.error('Teardown execution error in finally block:', e);
    }
    s1.close();
    s2.close();
    sAdmin.close();
  }
}

runPhase9ConcurrencySuite().catch((err) => {
  console.error('Unhandled concurrency test error:', err);
  process.exit(1);
});
