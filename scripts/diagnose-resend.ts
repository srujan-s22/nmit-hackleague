// Mock 'server-only' for non-Next CLI runtime
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as any;

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

async function runDiagnostic() {
  console.log('=== NMIT HackLeague — Resend Transactional Email Diagnostic ===\n');

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const isKeyConfigured = Boolean(
    apiKey &&
    apiKey.startsWith('re_') &&
    !apiKey.includes('placeholder') &&
    !apiKey.includes('dummy')
  );

  console.log('1. Configuration Check:');
  console.log(`   - RESEND_API_KEY configured: ${isKeyConfigured}`);
  console.log(`   - RESEND_API_KEY prefix: ${apiKey ? apiKey.slice(0, 5) + '...' : 'NONE'}`);
  console.log(`   - RESEND_FROM_EMAIL: ${fromEmail}`);
  console.log(`   - Simulation Mode: ${!isKeyConfigured ? 'ACTIVE (Will short-circuit)' : 'INACTIVE (Will invoke live Resend API)'}\n`);

  if (!isKeyConfigured) {
    console.error('ERROR: RESEND_API_KEY is missing or invalid format (must start with re_).');
    process.exit(1);
  }

  console.log('2. Live API Dispatch Test (Target: delivered@resend.dev, Sender: onboarding@resend.dev):');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: ['delivered@resend.dev'],
        subject: 'NMIT HackLeague — Automated Diagnostic Ping',
        html: '<p>This is a safe test email sent to Resend documented sink.</p>',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const status = response.status;
    const body = await response.json();

    console.log(`   - HTTP Status: ${status} (${response.statusText || (response.ok ? 'OK' : 'Error')})`);
    if (response.ok && body.id) {
      console.log(`   - Resend Email ID: ${body.id}`);
      console.log('   ✓ Resend accepted the test email for delivery.');
    } else {
      console.log(`   - Resend Error Name: ${body.name || 'Unknown'}`);
      console.log(`   - Resend Error Message: ${body.message || JSON.stringify(body)}`);
    }

    console.log('\n3. Policy Analysis for Onboarding Domain:');
    if (fromEmail.includes('resend.dev')) {
      console.log('   [NOTICE] The sender is using Resend free sandbox domain (@resend.dev).');
      console.log('   According to Resend security documentation:');
      console.log('   - Sandbox domains (@resend.dev) can ONLY send to your registered account owner email or delivered@resend.dev.');
      console.log('   - Sending to arbitrary external emails (like newly provisioned admins) returns HTTP 403 validation_error.');
      console.log('   - To send live emails to any administrator or student, verify a custom domain in Resend (resend.com/domains).');
    }
  } catch (err) {
    console.error('   ✗ Network or fetch exception:', err instanceof Error ? err.message : String(err));
  }
}

runDiagnostic().catch(console.error);
