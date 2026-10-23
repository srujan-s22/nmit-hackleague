import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

export interface BackupManifest {
  timestamp: string;
  backupFile: string;
  checksumSha256: string;
  sizeBytes: number;
  tables: string[];
  supabaseFreeNotice: string;
}

export async function createDatabaseBackup(outputDir = path.resolve(process.cwd(), 'backups')): Promise<BackupManifest> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-${timestamp}.sql`;
  const backupFilePath = path.join(outputDir, backupFileName);
  const manifestFilePath = path.join(outputDir, `backup-${timestamp}.meta.json`);

  console.log(`[Backup] Initiating independent database backup at ${new Date().toISOString()}...`);

  // Execute pg_dump from local docker container or local supabase CLI
  try {
    const dumpCmd = `docker exec supabase_db_hackleague pg_dump -U postgres -d postgres --schema=public --no-owner --no-privileges`;
    const sqlOutput = execSync(dumpCmd, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' });

    fs.writeFileSync(backupFilePath, sqlOutput, 'utf-8');
  } catch (err) {
    // Fallback: Use supabase db dump if docker exec direct call fails
    try {
      const fallbackCmd = `npx supabase db dump --local`;
      const sqlOutput = execSync(fallbackCmd, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' });
      fs.writeFileSync(backupFilePath, sqlOutput, 'utf-8');
    } catch (fallbackErr) {
      throw new Error(`Database backup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const fileBuffer = fs.readFileSync(backupFilePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const sizeBytes = fileBuffer.length;

  const keyTables = [
    'profiles',
    'admin_profiles',
    'admin_roles',
    'admin_permissions',
    'hackathons',
    'hackathon_rounds',
    'teams',
    'team_members',
    'submissions',
    'reviews',
    'points_ledger',
    'announcements',
    'announcement_reads',
    'user_push_subscriptions',
    'push_delivery_logs',
    'email_delivery_logs',
    'audit_logs',
  ];

  const manifest: BackupManifest = {
    timestamp,
    backupFile: backupFileName,
    checksumSha256: hash,
    sizeBytes,
    tables: keyTables,
    supabaseFreeNotice: 'Supabase Free plan databases pause after 7 days of inactivity. Independent offline backups ensure data resilience and zero vendor lock-in.',
  };

  fs.writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[Backup] Successfully generated ${backupFileName} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  console.log(`[Backup] SHA-256: ${hash}`);

  return manifest;
}

// Allow direct CLI execution: tsx scripts/backup-database.ts
if (require.main === module) {
  createDatabaseBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
