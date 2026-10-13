import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { StudentProfile, AdminProfile } from '@/types/auth';

export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  return { supabase, user };
}

export async function getStudentProfile(): Promise<StudentProfile | null> {
  const { supabase, user } = await requireAuth();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile as unknown as StudentProfile;
}

export async function requireStudent(): Promise<{ profile: StudentProfile; user: { id: string; email?: string } }> {
  const { user } = await requireAuth();
  const profile = await getStudentProfile();

  if (!profile) {
    redirect('/onboarding');
  }

  return { profile, user };
}

export async function requireApprovedStudent(): Promise<{ profile: StudentProfile; user: { id: string; email?: string } }> {
  const { profile, user } = await requireStudent();

  switch (profile.registration_status) {
    case 'approved':
      return { profile, user };
    case 'draft':
      redirect('/onboarding');
    case 'under_review':
    case 'pending_verification':
      redirect('/status/pending');
    case 'correction_required':
    case 'rejected':
      redirect('/status/rejected');
    case 'suspended':
      redirect('/status/suspended');
    default:
      redirect('/status/pending');
  }
}

export async function requireAdmin(requiredPermission?: string): Promise<{
  admin: AdminProfile;
  permissions: string[];
}> {
  const { supabase, user } = await requireAuth();

  const { data: admin, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !admin || !admin.is_active) {
    redirect('/login');
  }

  const { data: permissionsData } = await supabase
    .from('admin_permissions')
    .select('permission')
    .eq('admin_id', user.id);

  const permissions = (permissionsData || []).map((p) => p.permission);

  if (requiredPermission && !admin.is_super_admin) {
    if (!permissions.includes(requiredPermission)) {
      redirect('/login');
    }
  }

  return { admin: admin as unknown as AdminProfile, permissions };
}
