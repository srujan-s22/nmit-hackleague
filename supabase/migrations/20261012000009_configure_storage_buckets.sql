-- Migration 09: Configure Storage Buckets
-- Created: 2026-10-12
-- Schema: storage

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('college-ids', 'college-ids', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf']),
  ('profile-photos', 'profile-photos', false, 2097152, ARRAY['image/jpeg', 'image/png']),
  ('submission-evidence', 'submission-evidence', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/zip'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
