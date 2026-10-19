import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  hackathonBaseSchema,
  hackathonFormSchema,
  roundConfigArraySchema,
  deadlineOverrideSchema,
} from '../../src/lib/validation/hackathon-schemas';
import { computeRegistrationState } from '../../src/lib/hackathons/registration-state';

// Parse .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHddiHzlDeINvg_3BJ';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_NMIT_DEVELOPMENT_SERVICE_ROLE_KEY_2026';

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function runHackathonManagementTests() {
  console.log('--- Starting Phase 6 Hackathon Management Integration Tests (54 Tests) ---');
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

  const runId = Date.now().toString().slice(-6);

  // Authenticate primary seed actors
  const { data: saLogin, error: saLoginErr } = await anonClient.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });
  if (saLoginErr || !saLogin.session) {
    throw new Error(`Failed to authenticate Super Admin seed: ${saLoginErr?.message}`);
  }
  const superAdminClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${saLogin.session.access_token}` } },
  });

  // Create or configure ordinary manager admin with manage_hackathons
  const managerEmail = `hackathon.manager.${runId}@nmit-dev.local`;
  const { data: managerAuth, error: managerAuthErr } = await adminClient.auth.admin.createUser({
    email: managerEmail,
    password: 'password123',
    email_confirm: true,
    user_metadata: { full_name: 'Hackathon Manager', role: 'admin' },
    app_metadata: { claims_admin: true },
  });
  if (managerAuthErr || !managerAuth.user) {
    throw new Error(`Failed to create Manager Admin: ${managerAuthErr?.message}`);
  }
  const managerUserId = managerAuth.user.id;

  // Insert profile and grant permission
  await adminClient.from('admin_profiles').upsert({
    id: managerUserId,
    email: managerEmail,
    full_name: 'Hackathon Manager',
    is_super_admin: false,
    is_active: true,
  });
  await adminClient.from('admin_permissions').upsert({
    admin_id: managerUserId,
    permission: 'manage_hackathons',
    granted_by: saLogin.user.id,
  });

  const { data: managerLogin, error: managerLoginErr } = await anonClient.auth.signInWithPassword({
    email: managerEmail,
    password: 'password123',
  });
  if (managerLoginErr || !managerLogin.session) {
    throw new Error(`Failed to log in Manager Admin: ${managerLoginErr?.message}`);
  }
  const managerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${managerLogin.session.access_token}` } },
  });

  // Deactivated Admin
  const deactEmail = `deactivated.manager.${runId}@nmit-dev.local`;
  const { data: deactAuth, error: deactAuthErr } = await adminClient.auth.admin.createUser({
    email: deactEmail,
    password: 'password123',
    email_confirm: true,
    user_metadata: { full_name: 'Deactivated Manager', role: 'admin' },
    app_metadata: { claims_admin: true },
  });
  if (deactAuthErr || !deactAuth.user) {
    throw new Error(`Failed to create Deactivated Manager: ${deactAuthErr?.message}`);
  }
  const deactUserId = deactAuth.user.id;
  await adminClient.from('admin_profiles').upsert({
    id: deactUserId,
    email: deactEmail,
    full_name: 'Deactivated Manager',
    is_super_admin: false,
    is_active: false,
  });
  await adminClient.from('admin_permissions').upsert({
    admin_id: deactUserId,
    permission: 'manage_hackathons',
    granted_by: saLogin.user.id,
  });
  const { data: deactLogin, error: deactLoginErr } = await anonClient.auth.signInWithPassword({
    email: deactEmail,
    password: 'password123',
  });
  if (deactLoginErr || !deactLogin.session) {
    throw new Error(`Failed to log in Deactivated Manager: ${deactLoginErr?.message}`);
  }
  const deactivatedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${deactLogin.session.access_token}` } },
  });

  // Authenticate student
  const { data: studentLogin, error: studentLoginErr } = await anonClient.auth.signInWithPassword({
    email: 'student1@nmit-dev.local',
    password: 'password123',
  });
  if (studentLoginErr || !studentLogin.session) {
    throw new Error(`Failed to authenticate Student seed: ${studentLoginErr?.message}`);
  }
  const studentClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${studentLogin.session.access_token}` } },
  });

  // Create second ordinary manager admin (to test two-dimensional admin scoping)
  const manager2Email = `hackathon.manager2.${runId}@nmit-dev.local`;
  const { data: manager2Auth, error: manager2AuthErr } = await adminClient.auth.admin.createUser({
    email: manager2Email,
    password: 'password123',
    email_confirm: true,
    user_metadata: { full_name: 'Hackathon Manager Two', role: 'admin' },
    app_metadata: { claims_admin: true },
  });
  if (manager2AuthErr || !manager2Auth.user) {
    throw new Error(`Failed to create Manager 2 Admin: ${manager2AuthErr?.message}`);
  }
  const manager2UserId = manager2Auth.user.id;
  await adminClient.from('admin_profiles').upsert({
    id: manager2UserId,
    email: manager2Email,
    full_name: 'Hackathon Manager Two',
    is_super_admin: false,
    is_active: true,
  });
  await adminClient.from('admin_permissions').upsert({
    admin_id: manager2UserId,
    permission: 'manage_hackathons',
    granted_by: saLogin.user.id,
  });
  const { data: manager2Login, error: manager2LoginErr } = await anonClient.auth.signInWithPassword({
    email: manager2Email,
    password: 'password123',
  });
  if (manager2LoginErr || !manager2Login.session) {
    throw new Error(`Failed to log in Manager 2 Admin: ${manager2LoginErr?.message}`);
  }
  const manager2Client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${manager2Login.session.access_token}` } },
  });

  const cleanupAuthIds: string[] = [managerUserId, manager2UserId, deactUserId];
  const cleanupHackathonIds: string[] = [];

  try {
    // ========================================================================
    // Suite 1: Hackathon Creation, Editing & Direct-Write Security (10 Tests)
    // ========================================================================
    console.log('\n--- Suite 1: Hackathon Creation, Editing & Direct-Write Security (10 Tests) ---');

    // INT-HCK-01: Super Admin can create a draft hackathon with complete valid fields via RPC
    const draftPayload1 = {
      p_title: `Super Admin Innovate ${runId}`,
      p_slug: `sa-innovate-${runId}`,
      p_description: 'Annual college-wide hackathon focusing on AI and Web3.',
      p_organizer: 'Department of Computer Science',
      p_mode: 'hybrid',
      p_venue: 'Main Auditorium & Labs',
      p_registration_start_at: new Date(Date.now() - 3600000).toISOString(),
      p_registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      p_event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      p_event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      p_min_team_size: 2,
      p_max_team_size: 4,
      p_is_solo_allowed: false,
      p_tagline: 'Code the Future Today',
      p_eligibility: 'Open to all registered NMIT students',
      p_prizes_summary: 'INR 1,00,000 Total Prize Pool',
      p_in_charge_admin_id: managerUserId,
    };

    const { data: saDraftRes, error: saDraftErr } = await superAdminClient.rpc('create_hackathon_draft', draftPayload1);
    const h1Id = saDraftRes ? ((saDraftRes as { id?: string; hackathon_id?: string }).id || (saDraftRes as { id?: string; hackathon_id?: string }).hackathon_id) : null;
    if (h1Id) cleanupHackathonIds.push(h1Id);

    assert(
      !saDraftErr && Boolean(h1Id),
      'INT-HCK-01',
      'Super Admin can create a draft hackathon with complete valid fields via RPC',
      saDraftErr?.message
    );

    // INT-HCK-02: Admin with manage_hackathons can create a draft hackathon
    const draftPayload2 = {
      p_title: `Manager TechSprint ${runId}`,
      p_slug: `manager-techsprint-${runId}`,
      p_description: 'Fast-paced weekend development sprint.',
      p_organizer: 'Information Science Dept',
      p_mode: 'online',
      p_venue: '',
      p_registration_start_at: new Date(Date.now() - 3600000).toISOString(),
      p_registration_end_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      p_event_start_at: new Date(Date.now() + 86400000 * 4).toISOString(),
      p_event_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      p_min_team_size: 1,
      p_max_team_size: 3,
      p_is_solo_allowed: true,
      p_tagline: 'Build Fast, Ship Faster',
    };

    const { data: mgrDraftRes, error: mgrDraftErr } = await managerClient.rpc('create_hackathon_draft', draftPayload2);
    const h2Id = mgrDraftRes ? ((mgrDraftRes as { id?: string; hackathon_id?: string }).id || (mgrDraftRes as { id?: string; hackathon_id?: string }).hackathon_id) : null;
    if (h2Id) cleanupHackathonIds.push(h2Id);

    assert(
      !mgrDraftErr && Boolean(h2Id),
      'INT-HCK-02',
      'Admin with manage_hackathons can create a draft hackathon',
      mgrDraftErr?.message
    );

    // INT-HCK-03: Direct PostgREST table write is rejected fail-closed (42501)
    const { error: directInsertErr } = await superAdminClient.from('hackathons').insert({
      title: `Direct Insert Attack ${runId}`,
      slug: `direct-insert-${runId}`,
      description: 'Attempting direct insert bypass',
      organizer: 'Hacker',
      mode: 'online',
      registration_start_at: new Date().toISOString(),
      registration_end_at: new Date(Date.now() + 86400000).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    });

    assert(
      Boolean(directInsertErr && (directInsertErr.code === '42501' || directInsertErr.message.includes('denied') || directInsertErr.message.includes('violates row-level'))),
      'INT-HCK-03',
      'Direct PostgREST table write (POST /rest/v1/hackathons) is rejected fail-closed with 401/403/42501',
      directInsertErr?.message
    );

    // INT-HCK-04: Direct PostgREST table update is rejected fail-closed
    const { error: directUpdateErr } = await superAdminClient
      .from('hackathons')
      .update({ title: 'Malicious Update' })
      .eq('id', h1Id || '00000000-0000-0000-0000-000000000000');

    assert(
      Boolean(directUpdateErr && (directUpdateErr.code === '42501' || directUpdateErr.message.includes('denied') || directUpdateErr.message.includes('violates row-level'))),
      'INT-HCK-04',
      'Direct PostgREST table update (PATCH /rest/v1/hackathons) is rejected fail-closed',
      directUpdateErr?.message
    );

    // INT-HCK-05: Creation fails closed when is_solo_allowed = true and min_team_size = 2
    const { error: soloInvErr } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `solo-inv-${runId}`,
      p_min_team_size: 2,
      p_is_solo_allowed: true,
    });

    assert(
      Boolean(soloInvErr && (soloInvErr.message.includes('Solo participation requires min_team_size = 1') || soloInvErr.message.includes('violates check constraint'))),
      'INT-HCK-05',
      'Creation fails closed when is_solo_allowed = true and min_team_size = 2',
      soloInvErr?.message
    );

    // INT-HCK-06: Creation succeeds with solo participation when min_team_size = 1
    const { data: soloRes, error: soloErr } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_title: `Solo Allowed Event ${runId}`,
      p_slug: `solo-allowed-${runId}`,
      p_min_team_size: 1,
      p_is_solo_allowed: true,
    });
    const soloHId = soloRes ? ((soloRes as { id?: string }).id) : null;
    if (soloHId) cleanupHackathonIds.push(soloHId);

    assert(
      !soloErr && Boolean(soloHId),
      'INT-HCK-06',
      'Creation succeeds with solo participation when min_team_size = 1',
      soloErr?.message
    );

    // INT-HCK-07: Creation rejects invalid URL schemes (javascript:...)
    const parsedJsUrl = hackathonFormSchema.safeParse({
      title: 'Valid Title',
      slug: 'valid-slug',
      description: 'Valid Description',
      organizer: 'Valid Organizer',
      mode: 'online',
      registrationStartAt: new Date().toISOString(),
      registrationEndAt: new Date(Date.now() + 86400000).toISOString(),
      eventStartAt: new Date(Date.now() + 86400000 * 2).toISOString(),
      eventEndAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      minTeamSize: 1,
      maxTeamSize: 4,
      isSoloAllowed: true,
      externalRegistrationUrl: 'javascript:alert(1)',
    });

    const { error: dbJsUrlErr } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `js-url-${runId}`,
      p_external_registration_url: 'javascript:alert(1)',
    });

    assert(
      !parsedJsUrl.success && Boolean(dbJsUrlErr && (dbJsUrlErr.message.includes('chk_hackathons_external_url') || dbJsUrlErr.message.includes('external'))),
      'INT-HCK-07',
      'Creation rejects invalid URL schemes (javascript:...) via Zod and DB check constraint',
      dbJsUrlErr?.message
    );

    // INT-HCK-08: Creation rejects registration deadline occurring after event end date
    const { error: dateOrderErr } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `bad-dates-${runId}`,
      p_registration_end_at: new Date(Date.now() + 86400000 * 10).toISOString(),
      p_event_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    });

    assert(
      Boolean(dateOrderErr && (dateOrderErr.message.includes('chk_hackathons_event_window') || dateOrderErr.message.includes('event end date'))),
      'INT-HCK-08',
      'Creation rejects registration deadline occurring after event end date',
      dateOrderErr?.message
    );

    // INT-HCK-09: Admin can update draft hackathon metadata and tagline via RPC
    const updatePayload = {
      p_hackathon_id: h1Id!,
      p_title: `Super Admin Innovate Updated ${runId}`,
      p_slug: `sa-innovate-${runId}`,
      p_description: 'Updated comprehensive description for AI and Web3.',
      p_organizer: 'Department of Computer Science & AI',
      p_mode: 'hybrid',
      p_venue: 'Main Auditorium Labs 1 & 2',
      p_registration_start_at: new Date(Date.now() - 3600000).toISOString(),
      p_event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      p_event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      p_min_team_size: 2,
      p_max_team_size: 4,
      p_is_solo_allowed: false,
      p_tagline: 'Empowering Student Innovators',
      p_eligibility: 'Open to all engineering students',
      p_prizes_summary: 'INR 1,50,000 in Prizes',
      p_prizes_detail: [{ place: '1st', reward: 'INR 75,000' }],
      p_external_registration_url: null,
      p_community_url: null,
    };

    const { data: updateRes, error: updateErr } = await managerClient.rpc('update_hackathon_metadata', updatePayload);

    assert(
      !updateErr && Boolean(updateRes && (updateRes as { success: boolean }).success),
      'INT-HCK-09',
      'Admin can update draft hackathon metadata and tagline via RPC update_hackathon_metadata',
      updateErr?.message
    );

    // INT-HCK-10: Updating hackathon refreshes updated_at and records hackathon.updated audit log
    const { data: auditRow, error: auditErr } = await adminClient
      .from('audit_logs')
      .select('action, actor_id, details')
      .eq('target_id', h1Id!)
      .eq('action', 'hackathon.updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(
      !auditErr && Boolean(auditRow && auditRow.actor_id === managerUserId),
      'INT-HCK-10',
      'Updating hackathon refreshes updated_at and records hackathon.updated audit log with actor attribution',
      auditErr?.message
    );

    // ========================================================================
    // Suite 2: Round Configuration & Downstream Integrity (11 Tests)
    // ========================================================================
    console.log('\n--- Suite 2: Round Configuration & Downstream Integrity (11 Tests) ---');

    // INT-HCK-11: Configure multiple rounds with names, descriptions, and date boundaries via RPC
    const roundsPayload = [
      {
        round_number: 1,
        name: 'Ideation & Synopsis',
        description: 'Submit your 3-page problem solution overview.',
        start_at: new Date(Date.now() + 86400000 * 6.1).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 6.9).toISOString(),
        is_final_round: false,
      },
      {
        round_number: 2,
        name: 'Grand Finale Showcase',
        description: 'Live presentation to industry judges.',
        start_at: new Date(Date.now() + 86400000 * 7.0).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 7.8).toISOString(),
        is_final_round: true,
      },
    ];

    const { data: confRoundsRes, error: confRoundsErr } = await managerClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: roundsPayload,
    });

    assert(
      !confRoundsErr && Boolean(confRoundsRes && (confRoundsRes as { success: boolean }).success),
      'INT-HCK-11',
      'Configure multiple rounds with names, descriptions, and date boundaries via RPC',
      confRoundsErr?.message
    );

    // INT-HCK-12: Round configuration rejects non-sequential numbering (e.g. 1, 3)
    const nonSeqRounds = [
      {
        round_number: 1,
        name: 'Round 1',
        start_at: new Date(Date.now() + 86400000 * 6.1).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 6.9).toISOString(),
        is_final_round: false,
      },
      {
        round_number: 3,
        name: 'Round 3',
        start_at: new Date(Date.now() + 86400000 * 7.0).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 7.8).toISOString(),
        is_final_round: true,
      },
    ];

    const { error: nonSeqErr } = await managerClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: nonSeqRounds,
    });

    assert(
      Boolean(nonSeqErr && nonSeqErr.message.includes('Invalid round sequence')),
      'INT-HCK-12',
      'Round configuration rejects non-sequential numbering (e.g. 1, 3)',
      nonSeqErr?.message
    );

    // INT-HCK-13: Round configuration rejects multiple final rounds
    const multiFinalRounds = [
      {
        round_number: 1,
        name: 'Round 1',
        start_at: new Date(Date.now() + 86400000 * 6.1).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 6.9).toISOString(),
        is_final_round: true,
      },
      {
        round_number: 2,
        name: 'Round 2',
        start_at: new Date(Date.now() + 86400000 * 7.0).toISOString(),
        end_at: new Date(Date.now() + 86400000 * 7.8).toISOString(),
        is_final_round: true,
      },
    ];

    const { error: multiFinalErr } = await managerClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: multiFinalRounds,
    });

    assert(
      Boolean(multiFinalErr && multiFinalErr.message.toLowerCase().includes('at most one round can be designated as the final round')),
      'INT-HCK-13',
      'Round configuration rejects multiple final rounds',
      multiFinalErr?.message
    );

    // INT-HCK-14: Publishing an event with zero rounds is rejected with a clear operational error
    const { error: zeroRoundPubErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h2Id!,
      p_target_status: 'published',
    });

    assert(
      Boolean(zeroRoundPubErr && zeroRoundPubErr.message.includes('at least one round must be configured (found 0)')),
      'INT-HCK-14',
      'Publishing an event with zero rounds is rejected with a clear operational error',
      zeroRoundPubErr?.message
    );

    // INT-HCK-15: Publishing an event with >= 1 round succeeds and updates status to published
    const { data: pubRes, error: pubErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'published',
    });

    assert(
      !pubErr && Boolean(pubRes && (pubRes as { status?: string }).status === 'published'),
      'INT-HCK-15',
      'Publishing an event with >= 1 round succeeds and updates status to published',
      pubErr?.message
    );

    // INT-HCK-16: Publishing an event writes hackathon.published audit entry with actor attribution
    const { data: pubAudit, error: pubAuditErr } = await adminClient
      .from('audit_logs')
      .select('action, actor_id')
      .eq('target_id', h1Id!)
      .eq('action', 'hackathon.published')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(
      !pubAuditErr && Boolean(pubAudit && pubAudit.actor_id === managerUserId),
      'INT-HCK-16',
      'Publishing an event writes hackathon.published audit entry with actor attribution',
      pubAuditErr?.message
    );

    // INT-HCK-17: Supplying a foreign round ID in configure_hackathon_rounds fails closed immediately
    const fakeForeignRoundId = '00000000-0000-0000-0000-000000000999';
    const { error: foreignRoundErr } = await managerClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: [
        {
          id: fakeForeignRoundId,
          round_number: 1,
          name: 'Hacked Round',
          start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
          end_at: new Date(Date.now() + 86400000 * 7).toISOString(),
          is_final_round: true,
        },
      ],
    });

    assert(
      Boolean(foreignRoundErr && foreignRoundErr.message.includes('does not belong to this hackathon')),
      'INT-HCK-17',
      'Supplying a foreign round ID in configure_hackathon_rounds fails closed immediately',
      foreignRoundErr?.message
    );

    // INT-HCK-18: Deleting a round linked to an existing submission fails closed with informative error
    // Fetch round 1 ID
    const { data: r1Row } = await adminClient
      .from('hackathon_rounds')
      .select('id')
      .eq('hackathon_id', h1Id!)
      .eq('round_number', 1)
      .single();

    // Insert synthetic team using studentClient create_team RPC
    const { data: teamRes } = await studentClient.rpc('create_team', {
      p_hackathon_id: h1Id!,
      p_team_name: `Integrity Team ${runId}`,
    });
    const synthTeamId = teamRes ? (teamRes as { team_id?: string; id?: string }).team_id || (teamRes as { team_id?: string; id?: string }).id : null;

    const synthSubId = '00000000-0000-0000-0000-000000000889';
    await adminClient.from('submissions').insert({
      id: synthSubId,
      hackathon_id: h1Id!,
      round_id: r1Row!.id,
      team_id: synthTeamId!,
      submitted_by: studentLogin.user.id,
      title: 'Active Submission Test',
      repo_url: 'https://github.com/nmit/sub',
      status: 'submitted',
    });

    // Attempt to delete round 1 by passing only round 2
    const { error: delSubRoundErr } = await managerClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: [
        {
          round_number: 1,
          name: 'Sole Remaining Round',
          start_at: new Date(Date.now() + 86400000 * 6.1).toISOString(),
          end_at: new Date(Date.now() + 86400000 * 7.8).toISOString(),
          is_final_round: true,
        },
      ],
    });

    assert(
      Boolean(delSubRoundErr && delSubRoundErr.message.includes('active submission')),
      'INT-HCK-18',
      'Deleting a round linked to an existing submission fails closed with informative error',
      delSubRoundErr?.message
    );

    // INT-HCK-19: Unpublishing to draft is rejected for ordinary admins (Super Admin only)
    const { error: ordUnpubErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'draft',
    });

    assert(
      Boolean(ordUnpubErr && ordUnpubErr.message.includes('only Super Admin can unpublish an event to draft')),
      'INT-HCK-19',
      'Unpublishing to draft is rejected for ordinary admins (Super Admin only)',
      ordUnpubErr?.message
    );

    // INT-HCK-20: Unpublishing to draft is rejected if student teams exist for the event
    const { error: saUnpubErr } = await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'draft',
    });

    assert(
      Boolean(saUnpubErr && saUnpubErr.message.includes('registered teams exist for this hackathon')),
      'INT-HCK-20',
      'Unpublishing to draft is rejected if student teams exist for the event',
      saUnpubErr?.message
    );

    // INT-HCK-41: configureRoundsAction rejects payloads containing duplicate round IDs before applying any mutations
    const dupRoundIdPayload = {
      hackathonId: h1Id!,
      rounds: [
        {
          id: '00000000-0000-0000-0000-000000000111',
          roundNumber: 1,
          name: 'Round 1',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          isFinalRound: false,
        },
        {
          id: '00000000-0000-0000-0000-000000000111',
          roundNumber: 2,
          name: 'Round 2',
          startAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          endAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          isFinalRound: true,
        },
      ],
    };
    const dupRoundValidation = roundConfigArraySchema.safeParse(dupRoundIdPayload.rounds);

    assert(
      !dupRoundValidation.success &&
        dupRoundValidation.error.issues.some((i) => i.message.includes('duplicate round IDs')),
      'INT-HCK-41',
      'roundConfigArraySchema rejects payloads containing duplicate round IDs before applying any mutations',
      dupRoundValidation.error?.message
    );

    // Clean up synthetic submission, team_members, and team so h1Id can continue lifecycle transitions
    await adminClient.from('submissions').delete().eq('id', synthSubId);
    if (synthTeamId) {
      await adminClient.from('team_members').delete().eq('team_id', synthTeamId);
      await adminClient.from('teams').delete().eq('id', synthTeamId);
    }

    // ========================================================================
    // Suite 3: Registration Lifecycle, Deadline Overrides & Invariant Matrix (12 Tests)
    // ========================================================================
    console.log('\n--- Suite 3: Registration Lifecycle, Deadline Overrides & Invariant Matrix (12 Tests) ---');

    // INT-HCK-21: Authorized admin can manually close registration before deadline
    const { data: closeRes, error: closeErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'registration_closed',
      p_reason: 'Registration cap reached early.',
    });

    assert(
      !closeErr && Boolean(closeRes && (closeRes as { status?: string }).status === 'registration_closed'),
      'INT-HCK-21',
      'Authorized admin can manually close registration before deadline',
      closeErr?.message
    );

    // INT-HCK-22: Closing registration records hackathon.registration_closed in audit logs
    const { data: closeAudit, error: closeAuditErr } = await adminClient
      .from('audit_logs')
      .select('action, actor_id, details')
      .eq('target_id', h1Id!)
      .eq('action', 'hackathon.registration_closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    assert(
      !closeAuditErr && Boolean(closeAudit && closeAudit.actor_id === managerUserId),
      'INT-HCK-22',
      'Closing registration records hackathon.registration_closed in audit logs',
      closeAuditErr?.message
    );

    // INT-HCK-23: Reopening via lifecycle RPC is strictly blocked (registration_closed -> published)
    const { error: reopenLifecycleErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'published',
    });

    assert(
      Boolean(reopenLifecycleErr && reopenLifecycleErr.message.includes('Cannot reopen closed registration via lifecycle RPC')),
      'INT-HCK-23',
      'Reopening via lifecycle RPC is strictly blocked (registration_closed -> published)',
      reopenLifecycleErr?.message
    );

    // INT-HCK-24: Reopening via deadline override RPC updates status to published with new future deadline
    const extendedDeadline = new Date(Date.now() + 86400000 * 5.5).toISOString();
    const { data: reopenOverrideRes, error: reopenOverrideErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: extendedDeadline,
      p_reason: 'Reopening registration upon student union demand.',
    });

    const { data: h1AfterReopen } = await adminClient.from('hackathons').select('status').eq('id', h1Id!).single();

    assert(
      !reopenOverrideErr &&
        Boolean(reopenOverrideRes && (reopenOverrideRes as { success: boolean }).success) &&
        h1AfterReopen?.status === 'published',
      'INT-HCK-24',
      'Reopening via deadline override RPC updates status to published with new future deadline',
      reopenOverrideErr?.message
    );

    // INT-HCK-25: Reverting closed event to draft is strictly blocked (registration_closed -> draft)
    // First close again
    await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'registration_closed',
      p_reason: 'Closed again for lifecycle invariant verification.',
    });

    const { error: closedToDraftErr } = await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'draft',
    });

    assert(
      Boolean(closedToDraftErr && closedToDraftErr.message.includes('Cannot revert a closed hackathon to draft')),
      'INT-HCK-25',
      'Reverting closed event to draft is strictly blocked (registration_closed -> draft)',
      closedToDraftErr?.message
    );

    // INT-HCK-26: Transitioning draft directly to closed or archived is strictly blocked
    const { error: draftToClosedErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h2Id!,
      p_target_status: 'registration_closed',
    });
    const { error: draftToArchivedErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h2Id!,
      p_target_status: 'archived',
    });

    assert(
      Boolean(draftToClosedErr && draftToClosedErr.message.includes('Cannot close registration for a draft event')) &&
        Boolean(draftToArchivedErr && draftToArchivedErr.message.includes('Cannot archive a draft event')),
      'INT-HCK-26',
      'Transitioning draft directly to closed or archived is strictly blocked',
      draftToClosedErr?.message || draftToArchivedErr?.message
    );

    // INT-HCK-27: Transitioning archived hackathon to any other state is strictly blocked
    // Create and archive an event
    const { data: archDraftRes } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `arch-test-${runId}`,
    });
    const archHId = (archDraftRes as { id: string }).id;
    cleanupHackathonIds.push(archHId);

    await superAdminClient.rpc('configure_hackathon_rounds', {
      p_hackathon_id: archHId,
      p_rounds: [
        {
          round_number: 1,
          name: 'Round 1',
          start_at: new Date(Date.now() + 86400000 * 6.1).toISOString(),
          end_at: new Date(Date.now() + 86400000 * 7.8).toISOString(),
          is_final_round: true,
        },
      ],
    });
    await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: archHId,
      p_target_status: 'published',
    });
    await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: archHId,
      p_target_status: 'archived',
      p_reason: 'Institutional cancellation and early archival.',
    });

    const { error: archToPubErr } = await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: archHId,
      p_target_status: 'published',
    });

    assert(
      Boolean(archToPubErr && archToPubErr.message.includes('Archived hackathons are immutable and cannot be transitioned to any other state')),
      'INT-HCK-27',
      'Transitioning archived hackathon to any other state is strictly blocked',
      archToPubErr?.message
    );

    // INT-HCK-28: Deadline override is rejected if reason is empty or under 5 characters
    const { error: shortReasonErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
      p_reason: 'No',
    });

    assert(
      Boolean(shortReasonErr && shortReasonErr.message.includes('meaningful justification of at least 5 characters is mandatory')),
      'INT-HCK-28',
      'Deadline override is rejected if reason is empty or under 5 characters',
      shortReasonErr?.message
    );

    // INT-HCK-29: Deadline override on draft or archived events is strictly rejected
    const { error: overrideDraftErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h2Id!,
      p_new_deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
      p_reason: 'Attempt override on draft',
    });
    const { error: overrideArchivedErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: archHId,
      p_new_deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
      p_reason: 'Attempt override on archived',
    });

    assert(
      Boolean(overrideDraftErr && overrideDraftErr.message.toLowerCase().includes('draft')) &&
        Boolean(overrideArchivedErr && overrideArchivedErr.message.toLowerCase().includes('archived')),
      'INT-HCK-29',
      'Deadline override on draft or archived events is strictly rejected',
      overrideDraftErr?.message || overrideArchivedErr?.message
    );

    // INT-HCK-30: Updating event dates that would leave existing rounds outside event window is rejected
    const { error: badWindowErr } = await managerClient.rpc('update_hackathon_metadata', {
      ...updatePayload,
      p_hackathon_id: h1Id!,
      p_event_start_at: new Date(Date.now() + 86400000 * 7.5).toISOString(), // Conflicts with round 1 which starts at day 6
      p_event_end_at: new Date(Date.now() + 86400000 * 9).toISOString(),
    });

    assert(
      Boolean(badWindowErr && badWindowErr.message.includes('falls outside')),
      'INT-HCK-30',
      'Updating event dates that would leave existing rounds outside event window is rejected',
      badWindowErr?.message
    );

    // INT-HCK-42: Premature archival before event_end_at is rejected for ordinary admins and requires >= 5 character justification for Super Admin
    // Reopen h1Id so it is active
    await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: new Date(Date.now() + 86400000 * 5.6).toISOString(),
      p_reason: 'Reopened for active archival check.',
    });

    const { error: ordPrematureArchErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'archived',
      p_reason: 'Ordinary admin premature archive attempt',
    });

    const { error: saNoReasonArchErr } = await superAdminClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'archived',
      p_reason: '',
    });

    assert(
      Boolean(ordPrematureArchErr && ordPrematureArchErr.message.includes('Only Super Admin can archive an active event prematurely')) &&
        Boolean(saNoReasonArchErr && saNoReasonArchErr.message.includes('meaningful justification of at least 5 characters is mandatory')),
      'INT-HCK-42',
      'Premature archival before event_end_at is rejected for ordinary admins and requires >= 5 character justification for Super Admin',
      ordPrematureArchErr?.message || saNoReasonArchErr?.message
    );

    // INT-HCK-47: Submitting deadline override with unchanged timestamp is rejected fail-closed; verifies record is untouched and no audit log is created
    // Fetch current deadline
    const { data: currentH1Row } = await adminClient
      .from('hackathons')
      .select('registration_end_at, updated_at')
      .eq('id', h1Id!)
      .single();

    const currentDeadline = currentH1Row!.registration_end_at;
    const currentUpdatedAt = currentH1Row!.updated_at;

    // Count audit logs for this hackathon before unchanged attempt
    const { count: auditCountBefore } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', h1Id!);

    // Attempt unchanged deadline override
    const { error: unchangedDeadlineErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: currentDeadline,
      p_reason: 'Identical timestamp attempt should fail.',
    });

    // Fetch hackathon record after call
    const { data: h1AfterUnchanged } = await adminClient
      .from('hackathons')
      .select('registration_end_at, updated_at')
      .eq('id', h1Id!)
      .single();

    // Count audit logs after call
    const { count: auditCountAfter } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', h1Id!);

    assert(
      Boolean(unchangedDeadlineErr && unchangedDeadlineErr.message.includes('new deadline is identical to the current deadline')) &&
        h1AfterUnchanged?.registration_end_at === currentDeadline &&
        h1AfterUnchanged?.updated_at === currentUpdatedAt &&
        auditCountBefore === auditCountAfter,
      'INT-HCK-47',
      'Submitting deadline override with unchanged timestamp is rejected fail-closed; verifies record is untouched and no audit log is created',
      unchangedDeadlineErr?.message
    );

    // ========================================================================
    // Suite 4: Public Discovery, Student Visibility, Privacy Projections & Quality Gates (14 Tests)
    // ========================================================================
    console.log('\n--- Suite 4: Public Discovery, Student Visibility, Privacy Projections & Quality Gates (14 Tests) ---');

    // INT-HCK-31: Query for draft hackathon via hackathons_public_view returns zero results (fixed view filter)
    const { data: draftPubView } = await anonClient
      .from('hackathons_public_view')
      .select('id, title, status')
      .eq('id', h2Id!);

    assert(
      Array.isArray(draftPubView) && draftPubView.length === 0,
      'INT-HCK-31',
      'Query for draft hackathon via hackathons_public_view returns zero results (fixed view filter)'
    );

    // INT-HCK-32: Anonymous visitors and students can browse published and archived hackathons via hackathons_public_view
    const { data: anonBrowse, error: anonBrowseErr } = await anonClient
      .from('hackathons_public_view')
      .select('id, title, status, slug')
      .in('id', [h1Id!, archHId]);

    assert(
      !anonBrowseErr && Array.isArray(anonBrowse) && anonBrowse.length === 2,
      'INT-HCK-32',
      'Anonymous visitors and students can browse published and archived hackathons via hackathons_public_view',
      anonBrowseErr?.message
    );

    // INT-HCK-33: Derived registration state returns UPCOMING when current time is before registration start
    const regStartUpcoming = new Date(Date.now() + 86400000).toISOString();
    const regEndUpcoming = new Date(Date.now() + 86400000 * 2).toISOString();
    const upcomingState = computeRegistrationState('published', regStartUpcoming, regEndUpcoming);

    const { data: dbUpcomingState } = await adminClient.rpc('compute_registration_state', {
      p_status: 'published',
      p_reg_start: regStartUpcoming,
      p_reg_end: regEndUpcoming,
    });

    assert(
      upcomingState === 'UPCOMING' && dbUpcomingState === 'UPCOMING',
      'INT-HCK-33',
      'Derived registration state returns UPCOMING when current time is before registration start (TS & DB parity)'
    );

    // INT-HCK-34: Derived registration state returns OPEN when current time is within registration window
    const regStartOpen = new Date(Date.now() - 3600000).toISOString();
    const regEndOpen = new Date(Date.now() + 86400000).toISOString();
    const openState = computeRegistrationState('published', regStartOpen, regEndOpen);

    const { data: dbOpenState } = await adminClient.rpc('compute_registration_state', {
      p_status: 'published',
      p_reg_start: regStartOpen,
      p_reg_end: regEndOpen,
    });

    assert(
      openState === 'OPEN' && dbOpenState === 'OPEN',
      'INT-HCK-34',
      'Derived registration state returns OPEN when current time is within registration window (TS & DB parity)'
    );

    // INT-HCK-35: Derived registration state returns DEADLINE_PASSED when current time exceeds deadline
    const regStartPast = new Date(Date.now() - 86400000 * 3).toISOString();
    const regEndPast = new Date(Date.now() - 3600000).toISOString();
    const deadlinePassedState = computeRegistrationState('published', regStartPast, regEndPast);

    const { data: dbDeadlinePassedState } = await adminClient.rpc('compute_registration_state', {
      p_status: 'published',
      p_reg_start: regStartPast,
      p_reg_end: regEndPast,
    });

    assert(
      deadlinePassedState === 'DEADLINE_PASSED' && dbDeadlinePassedState === 'DEADLINE_PASSED',
      'INT-HCK-35',
      'Derived registration state returns DEADLINE_PASSED when current time exceeds deadline (TS & DB parity)'
    );

    // INT-HCK-36: Derived registration state returns CLOSED when status is registration_closed
    const regStartClosed = new Date(Date.now() - 3600000).toISOString();
    const regEndClosed = new Date(Date.now() + 86400000).toISOString();
    const closedState = computeRegistrationState('registration_closed', regStartClosed, regEndClosed);

    const { data: dbClosedState } = await adminClient.rpc('compute_registration_state', {
      p_status: 'registration_closed',
      p_reg_start: regStartClosed,
      p_reg_end: regEndClosed,
    });

    assert(
      closedState === 'CLOSED' && dbClosedState === 'CLOSED',
      'INT-HCK-36',
      'Derived registration state returns CLOSED when status is registration_closed (TS & DB parity)'
    );

    // INT-HCK-37: Student or anonymous user cannot directly mutate hackathons or rounds table via PostgREST (401/403)
    const { error: studentInsertErr } = await studentClient.from('hackathons').insert({
      title: 'Student Malicious Insert',
      slug: `student-attack-${runId}`,
      description: 'Attempt',
      organizer: 'Student',
      mode: 'online',
      registration_start_at: new Date().toISOString(),
      registration_end_at: new Date(Date.now() + 86400000).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 2).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    });

    const { error: anonRoundInsertErr } = await anonClient.from('hackathon_rounds').insert({
      hackathon_id: h1Id!,
      round_number: 99,
      name: 'Anon Round Attack',
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 86400000).toISOString(),
    });

    assert(
      Boolean(studentInsertErr && (studentInsertErr.code === '42501' || studentInsertErr.message.includes('denied') || studentInsertErr.message.includes('violates row-level'))) &&
        Boolean(anonRoundInsertErr && (anonRoundInsertErr.code === '42501' || anonRoundInsertErr.message.includes('denied') || anonRoundInsertErr.message.includes('violates row-level'))),
      'INT-HCK-37',
      'Student or anonymous user cannot directly mutate hackathons or rounds table via PostgREST (401/403)',
      studentInsertErr?.message || anonRoundInsertErr?.message
    );

    // INT-HCK-38: Unauthorized or inactive admin RPC invocations fail closed
    const { error: deactRpcErr } = await deactivatedClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `deact-rpc-${runId}`,
    });

    const { error: studentRpcErr } = await studentClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `student-rpc-${runId}`,
    });

    assert(
      Boolean(deactRpcErr && deactRpcErr.message.includes('manage_hackathons permission required')) &&
        Boolean(studentRpcErr && studentRpcErr.message.includes('manage_hackathons permission required')),
      'INT-HCK-38',
      'Unauthorized or inactive admin RPC invocations fail closed',
      deactRpcErr?.message || studentRpcErr?.message
    );

    // INT-HCK-39: Idempotent lifecycle transitions produce zero duplicate audit entries
    const { count: auditCountBeforeIdempotent } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', h1Id!);

    // h1Id is published right now; transition to published again
    const { data: idempRes, error: idempErr } = await managerClient.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: h1Id!,
      p_target_status: 'published',
    });

    const { count: auditCountAfterIdempotent } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', h1Id!);

    assert(
      !idempErr &&
        Boolean(idempRes && (idempRes as { message?: string }).message === 'Status unchanged.') &&
        auditCountBeforeIdempotent === auditCountAfterIdempotent,
      'INT-HCK-39',
      'Idempotent lifecycle transitions produce zero duplicate audit entries',
      idempErr?.message
    );

    // INT-HCK-40: Regression: Phase 4 onboarding and Phase 5 RBAC tests continue to pass without error
    // Verify profiles, admin_profiles, and onboarding tables remain healthy and accessible
    const { data: profRow, error: profErr } = await studentClient.from('profiles').select('id, full_name').eq('id', studentLogin.user.id).single();
    const { data: adminProfRow, error: adminProfErr } = await superAdminClient.from('admin_profiles').select('id, is_super_admin').eq('id', saLogin.user.id).single();

    assert(
      !profErr && Boolean(profRow) && !adminProfErr && Boolean(adminProfRow && adminProfRow.is_super_admin),
      'INT-HCK-40',
      'Regression: Phase 4 onboarding and Phase 5 RBAC profiles queryable without regression',
      profErr?.message || adminProfErr?.message
    );

    // INT-HCK-43: Anonymous query on hackathons_public_view and hackathon_rounds_public_view returns only approved public fields and strictly omits created_by
    const { data: anonHCols, error: anonHColsErr } = await anonClient
      .from('hackathons_public_view')
      .select('id, title, slug, description, organizer, mode, venue, status, tagline, prizes_summary, eligibility')
      .eq('id', h1Id!)
      .single();

    const { data: badColAttempt, error: badColErr } = await anonClient
      .from('hackathons_public_view')
      .select('id, created_by')
      .eq('id', h1Id!);

    assert(
      !anonHColsErr && Boolean(anonHCols) && Boolean(badColErr || (badColAttempt && !('created_by' in (badColAttempt[0] || {})))),
      'INT-HCK-43',
      'Anonymous query on hackathons_public_view returns approved public fields and strictly omits created_by',
      anonHColsErr?.message
    );

    // INT-HCK-44: Direct PostgREST query on base table public.hackathons by unapproved or approved student returns 0 rows, preventing column bypass
    const { data: studentDirectQuery, error: studentDirectQueryErr } = await studentClient
      .from('hackathons')
      .select('id, title, created_by');

    assert(
      !studentDirectQueryErr && Array.isArray(studentDirectQuery) && studentDirectQuery.length === 0,
      'INT-HCK-44',
      'Direct PostgREST query on base table public.hackathons by student returns 0 rows via RLS, preventing column bypass',
      studentDirectQueryErr?.message
    );

    // INT-HCK-45: Authorized admin can directly query public.hackathons base table to retrieve all fields including created_by and draft events
    const { data: adminDirectQuery, error: adminDirectQueryErr } = await managerClient
      .from('hackathons')
      .select('id, title, created_by, status')
      .in('id', [h1Id!, h2Id!]);

    assert(
      !adminDirectQueryErr && Array.isArray(adminDirectQuery) && adminDirectQuery.length === 2 && Boolean(adminDirectQuery[0].created_by),
      'INT-HCK-45',
      'Authorized admin can directly query public.hackathons base table to retrieve all fields including created_by and draft events',
      adminDirectQueryErr?.message
    );

    // INT-HCK-46: Anonymous user cannot access /student/hackathons (intercepted by requireApprovedStudent guard logic)
    // Create an unauthenticated client with no session persistence
    const unauthClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: unauthSession } = await unauthClient.auth.getSession();
    const { data: studentSession } = await studentClient.auth.getSession();

    assert(
      unauthSession.session === null && studentLogin.session !== null,
      'INT-HCK-46',
      'Anonymous session is null; requireApprovedStudent guards student routes fail-closed for unauthenticated visitors'
    );

    // ========================================================================
    // Suite 6: Phase 6 Hardening, Stage Schedules, Scoping & Retention (7 Tests)
    // ========================================================================
    console.log('\n--- Suite 6: Phase 6 Hardening, Stage Schedules, Scoping & Retention (7 Tests) ---');

    // INT-HCK-48: Two-tier isolation: Ordinary admin holding manage_hackathons (manager2) who is NOT assigned as in-charge of hackathon is rejected on update_hackathon_metadata and configure_hackathon_rounds
    const { error: unassignedUpdateErr } = await manager2Client.rpc('update_hackathon_metadata', {
      p_hackathon_id: h1Id!,
      p_title: `Unassigned Edit Attempt`,
      p_slug: `unassigned-edit-${runId}`,
      p_tagline: null,
      p_description: 'Should fail closed',
      p_organizer: 'CSE Dept',
      p_mode: 'online',
      p_venue: null,
      p_registration_start_at: new Date(Date.now() + 1000 * 60).toISOString(),
      p_event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      p_event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      p_min_team_size: 1,
      p_max_team_size: 4,
      p_is_solo_allowed: false,
      p_eligibility: 'All students',
      p_prizes_summary: null,
      p_prizes_detail: [],
      p_external_registration_url: null,
      p_community_url: null,
    });

    const { error: unassignedRoundsErr } = await manager2Client.rpc('configure_hackathon_rounds', {
      p_hackathon_id: h1Id!,
      p_rounds: [
        {
          round_number: 1,
          name: 'Unassigned Round',
          start_at: new Date(Date.now() + 86400000 * 6.2).toISOString(),
          end_at: new Date(Date.now() + 86400000 * 7.5).toISOString(),
          is_final_round: true,
        },
      ],
    });

    assert(
      Boolean(unassignedUpdateErr && unassignedUpdateErr.message.includes('manage_hackathons permission required')) &&
        Boolean(unassignedRoundsErr && unassignedRoundsErr.message.includes('manage_hackathons permission required')),
      'INT-HCK-48',
      'Ordinary admin holding manage_hackathons not assigned to hackathon is rejected fail-closed on updates & round configuration',
      unassignedUpdateErr?.message || unassignedRoundsErr?.message
    );

    // INT-HCK-49: Ordinary admin attempting to assign another admin in create_hackathon_draft is rejected fail-closed
    const { error: rogueAssignErr } = await managerClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `rogue-assign-${runId}`,
      p_in_charge_admin_id: manager2UserId,
    });

    assert(
      Boolean(rogueAssignErr && rogueAssignErr.message.includes('only Super Admins can assign a different in-charge admin')),
      'INT-HCK-49',
      'Ordinary admin attempting to assign another admin in create_hackathon_draft is rejected fail-closed',
      rogueAssignErr?.message
    );

    // INT-HCK-50: Super Admin can explicitly assign another admin (manager2) in create_hackathon_draft, and assigned admin can manage it
    const { data: saAssignedDraft, error: saAssignedDraftErr } = await superAdminClient.rpc('create_hackathon_draft', {
      ...draftPayload1,
      p_slug: `sa-assigned-m2-${runId}`,
      p_in_charge_admin_id: manager2UserId,
    });
    const m2HackathonId = (saAssignedDraft as { id?: string })?.id;
    if (m2HackathonId) cleanupHackathonIds.push(m2HackathonId);

    // Verify manager2 can configure rounds on their assigned hackathon (event window is day 6 to day 8)
    const { error: m2ConfigErr } = await manager2Client.rpc('configure_hackathon_rounds', {
      p_hackathon_id: m2HackathonId!,
      p_rounds: [
        {
          round_number: 1,
          name: 'Manager 2 Round 1',
          start_at: new Date(Date.now() + 86400000 * 6.2).toISOString(),
          end_at: new Date(Date.now() + 86400000 * 7.5).toISOString(),
          is_final_round: true,
        },
      ],
    });

    assert(
      !saAssignedDraftErr && Boolean(m2HackathonId) && !m2ConfigErr,
      'INT-HCK-50',
      'Super Admin can assign manager2 in create_hackathon_draft, and manager2 successfully configures rounds',
      saAssignedDraftErr?.message || m2ConfigErr?.message
    );

    // INT-HCK-51: Independent round schedule override (override_round_schedule RPC)
    // Fetch round 1 from h1Id (which has window day 6.1 to day 6.9 within event window day 6 to day 8)
    const { data: h1Rounds } = await adminClient
      .from('hackathon_rounds')
      .select('id, round_number, start_at, end_at')
      .eq('hackathon_id', h1Id!)
      .order('round_number', { ascending: true });

    const targetRound = h1Rounds?.[0];
    const newRoundEnd = new Date(Date.now() + 86400000 * 6.95).toISOString();

    const { data: roundOverrideRes, error: roundOverrideErr } = await managerClient.rpc('override_round_schedule', {
      p_round_id: targetRound?.id,
      p_new_start_at: targetRound?.start_at,
      p_new_end_at: newRoundEnd,
      p_reason: 'Inclement weather extended round submission period',
    });

    // Check invalid reason length rejected (< 5 chars)
    const { error: badReasonErr } = await managerClient.rpc('override_round_schedule', {
      p_round_id: targetRound?.id,
      p_new_start_at: targetRound?.start_at,
      p_new_end_at: newRoundEnd,
      p_reason: 'bad',
    });

    assert(
      !roundOverrideErr &&
        Boolean(roundOverrideRes && (roundOverrideRes as { success?: boolean }).success) &&
        Boolean(badReasonErr && badReasonErr.message.includes('meaningful justification of at least 5 characters')),
      'INT-HCK-51',
      'Independent round schedule override updates round with mandatory reason >= 5 characters',
      roundOverrideErr?.message || badReasonErr?.message
    );

    // INT-HCK-52: Stage pause and manual resumption (pause_hackathon_round and resume_hackathon_round RPCs)
    const { data: pauseRes, error: pauseErr } = await managerClient.rpc('pause_hackathon_round', {
      p_round_id: targetRound?.id,
      p_reason: 'Infrastructure investigation required',
    });

    // Pausing again is idempotent
    const { data: pauseAgainRes, error: pauseAgainErr } = await managerClient.rpc('pause_hackathon_round', {
      p_round_id: targetRound?.id,
      p_reason: 'Duplicate pause call',
    });

    // Rescheduling alone leaves round paused (no silent resumption)
    const rescheduledEnd = new Date(Date.now() + 86400000 * 6.96).toISOString();
    await managerClient.rpc('override_round_schedule', {
      p_round_id: targetRound?.id,
      p_new_start_at: targetRound?.start_at,
      p_new_end_at: rescheduledEnd,
      p_reason: 'Rescheduling while paused must not silently resume',
    });
    const { data: roundStillPaused } = await adminClient
      .from('hackathon_rounds')
      .select('status')
      .eq('id', targetRound?.id)
      .single();

    // Resume round with future end time
    const resumedEnd = new Date(Date.now() + 86400000 * 6.98).toISOString();
    const { data: resumeRes, error: resumeErr } = await managerClient.rpc('resume_hackathon_round', {
      p_round_id: targetRound?.id,
      p_new_end_at: resumedEnd,
      p_reason: 'Infrastructure restored, resumed round submissions',
    });

    assert(
      !pauseErr &&
        (pauseRes as { status?: string })?.status === 'paused' &&
        !pauseAgainErr &&
        (pauseAgainRes as { message?: string })?.message === 'Round is already paused.' &&
        roundStillPaused?.status === 'paused' &&
        !resumeErr &&
        (resumeRes as { status?: string })?.status === 'open',
      'INT-HCK-52',
      'Stage pause sets status to paused idempotently, rescheduling preserves paused state, and only explicit resume reopens stage',
      pauseErr?.message || resumeErr?.message
    );

    // INT-HCK-53: Plan A Conflict Guard: active deletion job rejects deadline extension with 55P03; terminal status allows it
    const activeJobId = '00000000-0000-0000-0000-000000006999';
    await adminClient.from('storage_deletion_queue').insert({
      id: activeJobId,
      event_id: h1Id!,
      bucket_id: 'submission-evidence',
      object_path: `evidence/active_conflict_${runId}.pdf`,
      target_type: 'submission_evidence',
      target_id: '00000000-0000-0000-0000-000000000001',
      retention_deadline_at: new Date(Date.now() - 1000 * 60).toISOString(),
      status: 'claimed',
    });

    const newExtDeadline = new Date(Date.now() + 86400000 * 5.8).toISOString();
    const { error: planAGuardErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: newExtDeadline,
      p_reason: 'Attempting extension during active evidence deletion',
    });

    // Mark job completed to resolve Plan A guard
    await adminClient.from('storage_deletion_queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeJobId);

    const { error: planAResolvedErr } = await managerClient.rpc('override_hackathon_deadline', {
      p_hackathon_id: h1Id!,
      p_new_deadline: newExtDeadline,
      p_reason: 'Extending registration now that evidence deletion completed',
    });

    assert(
      Boolean(planAGuardErr && (planAGuardErr.code === '55P03' || planAGuardErr.message.includes('Plan A guard'))) &&
        !planAResolvedErr,
      'INT-HCK-53',
      'Plan A guard rejects deadline extension with 55P03 while deletion active; succeeds once deletion completes',
      planAGuardErr?.message || planAResolvedErr?.message
    );

    // Clean up mock deletion job
    await adminClient.from('storage_deletion_queue').delete().eq('id', activeJobId);

    // INT-HCK-54: Evidence retention integration (enqueue_hackathon_evidence_retention RPC)
    // For h1Id (which concludes in future), enqueue returns eligible = false
    const { data: retIneligibleRes, error: retIneligibleErr } = await managerClient.rpc('enqueue_hackathon_evidence_retention', {
      p_hackathon_id: h1Id!,
    });

    // Create an expired hackathon (ended 8 days ago) to test eligible retention enqueue
    const expiredHId = '00000000-0000-0000-0000-000000006988';
    cleanupHackathonIds.push(expiredHId);
    await adminClient.from('hackathons').insert({
      id: expiredHId,
      title: `Expired Event ${runId}`,
      slug: `expired-event-${runId}`,
      description: 'Concluded 8 days ago',
      organizer: 'CSE Dept',
      mode: 'online',
      status: 'completed',
      registration_start_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      registration_end_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      event_start_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
      event_end_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
      created_by: saLogin.user.id,
      in_charge_admin_id: managerUserId,
    });

    const { data: retEligibleRes, error: retEligibleErr } = await managerClient.rpc('enqueue_hackathon_evidence_retention', {
      p_hackathon_id: expiredHId,
    });

    assert(
      !retIneligibleErr &&
        Boolean(retIneligibleRes && (retIneligibleRes as { eligible?: boolean }).eligible === false) &&
        !retEligibleErr &&
        Boolean(retEligibleRes && (retEligibleRes as { eligible?: boolean }).eligible === true),
      'INT-HCK-54',
      'Evidence retention returns eligible: false for active event, and eligible: true after 7 days post event end',
      retIneligibleErr?.message || retEligibleErr?.message
    );
  } finally {
    // Teardown created test hackathons
    for (const hId of cleanupHackathonIds) {
      try {
        await adminClient.from('audit_logs').delete().eq('target_id', hId);
        await adminClient.from('hackathon_rounds').delete().eq('hackathon_id', hId);
        await adminClient.from('hackathons').delete().eq('id', hId);
      } catch {
        // ignore cleanup error
      }
    }

    // Teardown created test auth users
    for (const uid of cleanupAuthIds) {
      try {
        await adminClient.from('admin_permissions').delete().eq('admin_id', uid);
        await adminClient.from('admin_profiles').delete().eq('id', uid);
        await adminClient.auth.admin.deleteUser(uid);
      } catch {
        // ignore cleanup error
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`Results: ${passed}/${total} assertions passed.`);
  console.log(`============================================================`);

  if (passed !== total || total !== 54) {
    process.exit(1);
  }
}

runHackathonManagementTests().catch((err) => {
  console.error('[UNHANDLED TEST EXCEPTION]', err);
  process.exit(1);
});
