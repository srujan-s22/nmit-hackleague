import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  validateStorageFileBinary,
  generateRegistrationProofStoragePath,
} from '@/lib/storage/paths';
import { MANDATORY_CDC_DECLARATION_TEXT } from '@/lib/validation/team-schemas';

export interface UnresolvedArtifact {
  bucket: string;
  path: string;
  team_id: string;
  event_id?: string;
  storage_error?: string;
  queue_error?: string;
  audit_logged: boolean;
  audit_error?: string;
}

export type UploadRegistrationProofResult =
  | {
      success: true;
      external_status: string;
      path: string;
      points_awarded?: boolean;
    }
  | {
      success: false;
      error: string;
      cleanup_state: 'purged_immediately' | 'enqueued_durable' | 'unresolved_leak';
      unresolved_artifact?: UnresolvedArtifact;
    };

/**
 * Executes three-tier resilient orphan recovery if post-storage operations fail:
 * Tier 1: Immediate Storage Purge via adminClient.storage.from(...).remove()
 * Tier 2: Durable Queue Fallback via public.storage_deletion_queue
 * Tier 3: Emergency Incident Escalation (audit_logs insert)
 * Compound Persistence Failure: Emits [CRITICAL_STORAGE_LEAK_UNPERSISTED] to stderr and sets audit_logged = false
 */
export async function executeThreeTierOrphanRecovery(
  adminClient: ReturnType<typeof createAdminClient>,
  studentId: string,
  hackathonId: string | undefined,
  teamId: string,
  objectPath: string
): Promise<{
  cleanup_state: 'purged_immediately' | 'enqueued_durable' | 'unresolved_leak';
  unresolved_artifact?: UnresolvedArtifact;
}> {
  let storageErrMessage: string | undefined;
  let queueErrMessage: string | undefined;

  // Tier 1: Immediate storage removal via service-role client
  try {
    const { error: removeErr } = await adminClient.storage
      .from('submission-evidence')
      .remove([objectPath]);

    if (!removeErr) {
      return { cleanup_state: 'purged_immediately' };
    }
    storageErrMessage = removeErr.message;
  } catch (err: unknown) {
    storageErrMessage = err instanceof Error ? err.message : 'Storage removal threw an unexpected error';
  }

  // Tier 2: Durable queue fallback using existing table schema & partial index
  try {
    const { error: queueErr } = await adminClient.from('storage_deletion_queue').insert({
      event_id: hackathonId,
      bucket_id: 'submission-evidence',
      object_path: objectPath,
      target_type: 'orphaned_registration_proof',
      target_id: teamId,
      status: 'pending',
      retention_deadline_at: new Date().toISOString(),
      next_retry_at: new Date().toISOString(),
    });

    if (!queueErr) {
      return { cleanup_state: 'enqueued_durable' };
    }
    queueErrMessage = queueErr.message;
  } catch (err: unknown) {
    queueErrMessage = err instanceof Error ? err.message : 'Storage deletion queue insert threw an unexpected error';
  }

  // Tier 3: Emergency incident escalation for unresolved leak
  console.error('[CRITICAL_STORAGE_LEAK_UNRESOLVED]', {
    bucket: 'submission-evidence',
    object_path: objectPath,
    team_id: teamId,
    event_id: hackathonId,
    storage_error: storageErrMessage,
    queue_error: queueErrMessage,
  });

  let auditLogged = false;
  let auditErrMessage: string | undefined;

  try {
    const { error: auditErr } = await adminClient.from('audit_logs').insert({
      actor_id: studentId,
      actor_role: 'system_recovery',
      action: 'storage.orphan_leak_unresolved',
      target_type: 'storage_object',
      target_id: teamId,
      details: {
        bucket_id: 'submission-evidence',
        object_path: objectPath,
        team_id: teamId,
        event_id: hackathonId,
        storage_error: storageErrMessage,
        queue_error: queueErrMessage,
        alert_level: 'CRITICAL',
        timestamp: new Date().toISOString(),
      },
    });

    if (!auditErr) {
      auditLogged = true;
    } else {
      auditErrMessage = auditErr.message;
      // Compound Persistence Failure: Storage removal, deletion queue, AND audit log all failed.
      console.error('[CRITICAL_STORAGE_LEAK_UNPERSISTED] Emergency audit log insert failed:', {
        object_path: objectPath,
        team_id: teamId,
        storage_error: storageErrMessage,
        queue_error: queueErrMessage,
        audit_error: auditErrMessage,
      });
    }
  } catch (auditErr: unknown) {
    auditErrMessage = auditErr instanceof Error ? auditErr.message : 'Audit log insert threw an unexpected error';
    console.error('[CRITICAL_STORAGE_LEAK_UNPERSISTED] Emergency audit log insert threw:', {
      object_path: objectPath,
      team_id: teamId,
      storage_error: storageErrMessage,
      queue_error: queueErrMessage,
      audit_error: auditErrMessage,
    });
  }

  return {
    cleanup_state: 'unresolved_leak',
    unresolved_artifact: {
      bucket: 'submission-evidence',
      path: objectPath,
      team_id: teamId,
      event_id: hackathonId,
      storage_error: storageErrMessage,
      queue_error: queueErrMessage,
      audit_logged: auditLogged,
      audit_error: auditErrMessage,
    },
  };
}

/**
 * Secure Server-Mediated Registration Proof Screenshot Upload Service.
 * Implements strict dual-client separation and 3-tier orphan recovery.
 */
export async function uploadRegistrationProofScreenshot(
  teamId: string,
  file: File | Blob | { size: number; type: string; name?: string; arrayBuffer(): Promise<ArrayBuffer> },
  cdcAccepted: boolean,
  cdcDeclarationText: string = MANDATORY_CDC_DECLARATION_TEXT,
  client?: any
): Promise<UploadRegistrationProofResult> {
  // 1. Fast-path payload and size validation before reading into memory or accessing network
  if (!teamId || !teamId.trim()) {
    return {
      success: false,
      error: 'Team ID is required.',
      cleanup_state: 'purged_immediately',
    };
  }

  if (!cdcAccepted) {
    return {
      success: false,
      error: 'Mandatory CDC declaration acceptance is required to submit registration proof.',
      cleanup_state: 'purged_immediately',
    };
  }

  if (
    !cdcDeclarationText ||
    !cdcDeclarationText.includes('Career Development Centre (CDC)') ||
    !cdcDeclarationText.includes('genuine, unaltered')
  ) {
    return {
      success: false,
      error: 'Invalid or forged CDC declaration text.',
      cleanup_state: 'purged_immediately',
    };
  }

  if (!file) {
    return {
      success: false,
      error: 'A valid screenshot file is required.',
      cleanup_state: 'purged_immediately',
    };
  }

  // Pre-buffer file-size validation (1 MB = 1,048,576 bytes)
  if (file.size > 1048576) {
    return {
      success: false,
      error: `File size exceeds the 1 MB limit (actual: ${file.size} bytes).`,
      cleanup_state: 'purged_immediately',
    };
  }

  if (file.size <= 0) {
    return {
      success: false,
      error: 'File content is empty.',
      cleanup_state: 'purged_immediately',
    };
  }

  // 2. Authenticate caller session through session-aware Supabase client
  const userClient = client || (await createClient());
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'Authentication required. Please sign in to submit registration proof.',
      cleanup_state: 'purged_immediately',
    };
  }


  // 3. User-Scoped Client: Preflight Authorization Gate
  // Executes under the authenticated student's session (auth.uid() = user.id)
  const { data: isEligible, error: authCheckErr } = await userClient.rpc(
    'can_upload_registration_proof',
    {
      p_team_id_text: teamId,
    }
  );

  if (authCheckErr || !isEligible) {
    return {
      success: false,
      error:
        'Unauthorized: you are not the team leader, the registration window is closed or paused, or the team is already verified.',
      cleanup_state: 'purged_immediately',
    };
  }

  // Fetch hackathon_id under userClient for deletion queue foreign key linkage
  const { data: teamData } = await userClient
    .from('teams')
    .select('hackathon_id')
    .eq('id', teamId)
    .single();

  const hackathonId = teamData?.hackathon_id;

  // 4. In-Memory Byte Length & Binary Signature Validation
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > 1048576) {
    return {
      success: false,
      error: `File size exceeds the 1 MB limit (actual: ${buffer.byteLength} bytes).`,
      cleanup_state: 'purged_immediately',
    };
  }

  const filename = 'name' in file ? file.name : undefined;
  const binaryCheck = validateStorageFileBinary(buffer, 'submission-evidence', filename, file.type);
  if (!binaryCheck.valid) {
    return {
      success: false,
      error: binaryCheck.error || 'Invalid file format: contents do not match genuine image signatures.',
      cleanup_state: 'purged_immediately',
    };
  }

  // Registration proofs only allow PNG, JPEG, or WebP images
  if (
    binaryCheck.detectedMime !== 'image/png' &&
    binaryCheck.detectedMime !== 'image/jpeg' &&
    binaryCheck.detectedMime !== 'image/webp'
  ) {
    return {
      success: false,
      error: 'Invalid file format: registration proof must be a genuine PNG, JPEG, or WebP image.',
      cleanup_state: 'purged_immediately',
    };
  }

  let ext: 'png' | 'jpg' | 'jpeg' | 'webp' = 'png';
  if (binaryCheck.detectedMime === 'image/jpeg') ext = 'jpg';
  else if (binaryCheck.detectedMime === 'image/webp') ext = 'webp';

  const objectPath = generateRegistrationProofStoragePath(teamId, ext);

  // 5. Service-Role Storage Write (Restricted strictly to Storage)
  const adminClient = createAdminClient();
  const { error: uploadError } = await adminClient.storage
    .from('submission-evidence')
    .upload(objectPath, buffer, {
      contentType: binaryCheck.detectedMime,
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Storage upload failed: ${uploadError.message}`,
      cleanup_state: 'purged_immediately',
    };
  }

  // 6. Atomic Database RPC under Authenticated Student Context
  // Invoked via userClient so auth.uid() in PostgreSQL represents the genuine student,
  // validating leadership, row locks FOR UPDATE, and auditing actor_id = user.id.
  try {
    const { data: rpcData, error: rpcError } = await userClient.rpc('submit_registration_proof', {
      p_team_id: teamId,
      p_proof_path: objectPath,
      p_cdc_declaration_accepted: cdcAccepted,
      p_cdc_declaration_text: cdcDeclarationText,
    });

    if (rpcError) {
      const cleanupResult = await executeThreeTierOrphanRecovery(
        adminClient,
        user.id,
        hackathonId,
        teamId,
        objectPath
      );

      return {
        success: false,
        error: rpcError.message,
        cleanup_state: cleanupResult.cleanup_state,
        unresolved_artifact: cleanupResult.unresolved_artifact,
      };
    }

    const result = rpcData as {
      external_status?: string;
      points_awarded?: boolean;
    } | null;

    return {
      success: true,
      external_status: result?.external_status || 'submitted',
      path: objectPath,
      points_awarded: result?.points_awarded ?? true,
    };
  } catch (err: unknown) {
    const cleanupResult = await executeThreeTierOrphanRecovery(
      adminClient,
      user.id,
      hackathonId,
      teamId,
      objectPath
    );

    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred during registration proof submission.',
      cleanup_state: cleanupResult.cleanup_state,
      unresolved_artifact: cleanupResult.unresolved_artifact,
    };
  }
}
