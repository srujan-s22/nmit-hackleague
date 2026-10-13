-- Migration 08: Storage Deletion Queue Table
-- Created: 2026-10-12
-- Schema: public

CREATE TABLE public.storage_deletion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  object_path TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  lease_token UUID NULL,
  leased_by TEXT NULL,
  leased_until TIMESTAMPTZ NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT NULL,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_storage_queue_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE UNIQUE INDEX uq_storage_queue_active_job ON public.storage_deletion_queue (bucket_id, object_path) WHERE (status IN ('pending', 'processing'));
CREATE INDEX idx_storage_queue_poll ON public.storage_deletion_queue (status, next_retry_at) WHERE (status IN ('pending', 'processing'));

CREATE TRIGGER trg_storage_deletion_queue_updated_at
BEFORE UPDATE ON public.storage_deletion_queue
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
