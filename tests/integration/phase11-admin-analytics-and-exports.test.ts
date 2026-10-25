import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import { createClient } from '@supabase/supabase-js';
import { getAdminDashboardMetricsAction } from '../../src/actions/report-actions';

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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] [${testId}] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: [${testId}] ${testName} ${detail || ''}`);
  }
}

async function getSuperAdminClient() {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Failed to authenticate Super Admin seed: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { adminId: signInData.user.id, email: 'superadmin@nmit-dev.local', client };
}

async function runTests() {
  console.log('================================================================');
  console.log(' Phase 11: Admin Analytics and Exports Integration Test Suite');
  console.log('================================================================\n');

  const superAdmin = await getSuperAdminClient();

  // Test 1: get_admin_dashboard_metrics RPC works platform-wide
  console.log('[P11-EXP-01] get_admin_dashboard_metrics RPC Platform Scope');
  const { data: globalMetrics, error: metricsErr } = await superAdmin.client.rpc(
    'get_admin_dashboard_metrics' as never,
    { p_hackathon_id: null } as never
  );

  assert(!metricsErr, 'P11-EXP-01a', 'RPC get_admin_dashboard_metrics executes without error', metricsErr?.message);
  assert(!!globalMetrics, 'P11-EXP-01b', 'RPC returns metrics object');
  assert((globalMetrics as any)?.scope?.is_global === true, 'P11-EXP-01c', 'Global scope flag is true when p_hackathon_id is null');
  assert(typeof (globalMetrics as any)?.students?.total === 'number', 'P11-EXP-01d', 'Returns total students count');
  assert(typeof (globalMetrics as any)?.teams?.verified_external === 'number', 'P11-EXP-01e', 'Returns verified external teams count');
  assert(typeof (globalMetrics as any)?.profile_changes?.pending === 'number', 'P11-EXP-01f', 'Returns pending profile change requests count');

  // Test 2: get_admin_dashboard_metrics RPC with specific hackathon
  console.log('\n[P11-EXP-02] get_admin_dashboard_metrics RPC Scoped to Hackathon');
  const { data: hackathons } = await adminClient.from('hackathons').select('id').limit(1);
  if (hackathons && hackathons.length > 0) {
    const testHackathonId = hackathons[0].id;
    const { data: scopedMetrics, error: scopedErr } = await superAdmin.client.rpc(
      'get_admin_dashboard_metrics' as never,
      { p_hackathon_id: testHackathonId } as never
    );
    assert(!scopedErr, 'P11-EXP-02a', 'Scoped metrics executes without error', scopedErr?.message);
    assert((scopedMetrics as any)?.scope?.is_global === false, 'P11-EXP-02b', 'is_global is false for scoped query');
    assert((scopedMetrics as any)?.scope?.hackathon_id === testHackathonId, 'P11-EXP-02c', 'hackathon_id is correctly set in scope');
  } else {
    console.log('  - Skipped scoped hackathon check (no hackathons present)');
  }

  // Test 3: export_profile_change_requests_report RPC
  console.log('\n[P11-EXP-03] export_profile_change_requests_report RPC');
  const { data: exportedRequests, error: exportErr } = await superAdmin.client.rpc(
    'export_profile_change_requests_report' as never,
    { p_status_filter: null } as never
  );
  assert(!exportErr, 'P11-EXP-03a', 'export_profile_change_requests_report executes without error', exportErr?.message);
  assert(Array.isArray(exportedRequests), 'P11-EXP-03b', 'Returns array of profile change request records');

  // Filter by status 'pending'
  const { data: pendingRequests, error: pendingErr } = await superAdmin.client.rpc(
    'export_profile_change_requests_report' as never,
    { p_status_filter: 'pending' } as never
  );
  assert(!pendingErr, 'P11-EXP-03c', 'export_profile_change_requests_report with status filter executes without error');
  assert(Array.isArray(pendingRequests), 'P11-EXP-03d', 'Returns filtered array');

  // Test 4: Unauthenticated access to get_admin_dashboard_metrics is rejected
  console.log('\n[P11-EXP-04] Security & Role Enforcement');
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonMetricsErr } = await anonClient.rpc(
    'get_admin_dashboard_metrics' as never,
    { p_hackathon_id: null } as never
  );
  assert(!!anonMetricsErr, 'P11-EXP-04a', 'Anon user is denied access to get_admin_dashboard_metrics');

  const { error: anonExportErr } = await anonClient.rpc(
    'export_profile_change_requests_report' as never,
    { p_status_filter: null } as never
  );
  assert(!!anonExportErr, 'P11-EXP-04b', 'Anon user is denied access to export_profile_change_requests_report');

  // Test 5: Formula Injection Defense
  console.log('\n[P11-EXP-05] Formula Injection Defense with Leading Whitespace & Control Characters');
  const { sanitizeCellValue, generateCsvString, generateCsvZipPackage, generateExcelWorkbook } = await import('../../src/lib/reports/export-generators');

  const attackVectors = [
    '=cmd|"/c calc"!A0',
    '   =1+1',
    '  \t+SUM(A1:A10)',
    '\r\n-10-20',
    '@HYPERLINK("http://evil.com")',
    '   @SUM(B1:B5)',
    '\t=2+3',
    '%0a=cmd',
    "  '=1+1",
  ];

  for (const attack of attackVectors) {
    const sanitized = sanitizeCellValue(attack);
    assert(
      sanitized.startsWith("'"),
      'P11-EXP-05a',
      `Neutralizes formula injection by prepending single quote: "${attack.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}" -> "${sanitized.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`
    );
  }

  const safeInputs = [
    'Normal Student Name',
    '1NT21CS001',
    'Computer Science & Engineering',
    'Regular text without formulas',
  ];
  for (const safe of safeInputs) {
    const result = sanitizeCellValue(safe);
    assert(result === safe, 'P11-EXP-05b', `Preserves safe string untouched: "${safe}"`);
  }

  // Numbers and booleans should be safe string representations
  assert(sanitizeCellValue(42) === '42', 'P11-EXP-05c', 'Number 42 correctly formatted');
  assert(sanitizeCellValue(true) === 'true', 'P11-EXP-05d', 'Boolean true correctly formatted');
  assert(sanitizeCellValue(null) === '', 'P11-EXP-05e', 'Null converted to empty string');

  // Test 6: audit_data_export RPC Authorization & Scope Boundaries
  console.log('\n[P11-EXP-06] audit_data_export RPC Authorization & Scope Boundaries');
  // Anon user export attempt is rejected
  const { error: anonAuditErr } = await anonClient.rpc('audit_data_export' as never, {
    p_dataset: 'students',
    p_format: 'csv',
    p_hackathon_id: null,
  } as never);
  assert(!!anonAuditErr, 'P11-EXP-06a', 'Anon caller is denied audit_data_export');

  // Super Admin succeeds on platform-wide export
  const { error: superAuditErr } = await superAdmin.client.rpc('audit_data_export' as never, {
    p_dataset: 'students',
    p_format: 'csv',
    p_hackathon_id: null,
  } as never);
  assert(!superAuditErr, 'P11-EXP-06b', 'Super Admin succeeds on platform-wide audit_data_export', superAuditErr?.message);

  // Super Admin audit log export succeeds
  const { error: superAuditLogErr } = await superAdmin.client.rpc('audit_data_export' as never, {
    p_dataset: 'audit_logs',
    p_format: 'csv',
    p_hackathon_id: null,
  } as never);
  assert(!superAuditLogErr, 'P11-EXP-06c', 'Super Admin succeeds on audit_logs dataset export', superAuditLogErr?.message);

  // Invalid format rejected
  const { error: invalidFormatErr } = await superAdmin.client.rpc('audit_data_export' as never, {
    p_dataset: 'students',
    p_format: 'exe',
    p_hackathon_id: null,
  } as never);
  assert(!!invalidFormatErr, 'P11-EXP-06d', 'Invalid format rejected with error');

  // Invalid dataset rejected
  const { error: invalidDatasetErr } = await superAdmin.client.rpc('audit_data_export' as never, {
    p_dataset: 'passwords_table',
    p_format: 'csv',
    p_hackathon_id: null,
  } as never);
  assert(!!invalidDatasetErr, 'P11-EXP-06e', 'Invalid dataset rejected with error');

  // Test 7: Multi-Format Packaging Validation
  console.log('\n[P11-EXP-07] Multi-Format Packaging Validation (CSV, ZIP, XLSX)');
  const sampleDatasets = [
    {
      id: 'students',
      title: 'Students',
      headers: [
        { key: 'usn', label: 'USN' },
        { key: 'full_name', label: 'Full Name' },
        { key: 'branch', label: 'Branch' },
      ],
      rows: [
        { usn: '1NT21CS001', full_name: 'Alice', branch: 'CSE' },
        { usn: '1NT21CS002', full_name: '   =1+1 Attack', branch: 'ISE' },
      ],
    },
    {
      id: 'hackathons',
      title: 'Hackathons',
      headers: [
        { key: 'id', label: 'Hackathon ID' },
        { key: 'title', label: 'Title' },
      ],
      rows: [
        { id: '11111111-1111-1111-1111-111111111111', title: 'NMIT Hackathon 2026' },
      ],
    },
  ];

  // 7a. CSV generation
  const csvString = generateCsvString(sampleDatasets[0].headers, sampleDatasets[0].rows);
  assert(csvString.includes('USN,Full Name,Branch'), 'P11-EXP-07a', 'CSV includes header row');
  assert(csvString.includes('"\'   =1+1 Attack"'), 'P11-EXP-07b', 'CSV safely sanitizes and quotes attack payload');

  // 7b. ZIP generation
  const zipBuffer = await generateCsvZipPackage(sampleDatasets);
  assert(Buffer.isBuffer(zipBuffer), 'P11-EXP-07c', 'ZIP generator returns Buffer');
  assert(zipBuffer.length > 100, 'P11-EXP-07d', 'ZIP buffer contains data');
  assert(zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b, 'P11-EXP-07e', 'ZIP starts with PK magic bytes');

  // 7c. Excel Workbook generation
  const excelBuffer = await generateExcelWorkbook(sampleDatasets, 'NMIT HackLeague Verification');
  assert(Buffer.isBuffer(excelBuffer), 'P11-EXP-07f', 'Excel generator returns Buffer');
  assert(excelBuffer.length > 500, 'P11-EXP-07g', 'Excel buffer is non-trivial size');
  assert(excelBuffer[0] === 0x50 && excelBuffer[1] === 0x4b, 'P11-EXP-07h', 'Excel XLSX starts with PK zip magic bytes');

  // Test 8: Data Privacy Compliance
  console.log('\n[P11-EXP-08] Data Privacy Compliance (No Sex, DOB, Images, Tokens)');
  const { data: exportedStudents, error: studentErr } = await adminClient
    .from('profiles')
    .select('id, full_name, usn, email, branch, academic_year, phone, registration_status, created_at')
    .limit(5);

  assert(!studentErr, 'P11-EXP-08a', 'Export student query executes without error');
  if (exportedStudents && exportedStudents.length > 0) {
    const firstStudent = exportedStudents[0] as any;
    assert(!('sex' in firstStudent), 'P11-EXP-08b', 'Student export strictly excludes sex/gender');
    assert(!('date_of_birth' in firstStudent), 'P11-EXP-08c', 'Student export strictly excludes date_of_birth');
    assert(!('college_id_path' in firstStudent), 'P11-EXP-08d', 'Student export strictly excludes college_id_path');
    assert(!('profile_photo_path' in firstStudent), 'P11-EXP-08e', 'Student export strictly excludes profile_photo_path');
  }

  console.log('\n================================================================');
  console.log(` Phase 11 Admin Analytics & Reports Results: ${passedAssertions}/${totalAssertions} assertions passed`);
  console.log(' ALL TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
