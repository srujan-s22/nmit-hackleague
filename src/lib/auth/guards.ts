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

export async function requirePushSubscription(userId: string, redirectTo = '/student') {
  const supabase = await createClient();
  const { data: isPushActive, error } = await supabase.rpc('is_push_registered' as never, {
    p_user_id: userId,
  } as never);

  if (error || !isPushActive) {
    redirect(`/enable-push?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
}

export async function requireApprovedStudent(): Promise<{ profile: StudentProfile; user: { id: string; email?: string } }> {
  const { profile, user } = await requireStudent();

  switch (profile.registration_status) {
    case 'approved':
      await requirePushSubscription(user.id, '/student');
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
  user: { id: string; email?: string };
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

  await requirePushSubscription(user.id, '/admin/hackathons');

  return {
    admin: admin as unknown as AdminProfile,
    permissions,
    user: { id: user.id, email: user.email },
  };
}

export async function requireSuperAdmin(): Promise<{
  admin: AdminProfile;
  user: { id: string; email?: string };
}> {
  const { supabase, user } = await requireAuth();

  const { data: admin, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !admin || !admin.is_active || !admin.is_super_admin) {
    redirect('/login');
  }

  await requirePushSubscription(user.id, '/admin/admins');

  return {
    admin: admin as unknown as AdminProfile,
    user: { id: user.id, email: user.email },
  };
}

export async function getCurrentAdminProfile(): Promise<{
  admin: AdminProfile;
  permissions: string[];
  user: { id: string; email?: string };
} | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: admin, error: adminError } = await supabase
      .from('admin_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError || !admin || !admin.is_active) {
      return null;
    }

    const { data: permissionsData } = await supabase
      .from('admin_permissions')
      .select('permission')
      .eq('admin_id', user.id);

    const permissions = (permissionsData || []).map((p) => p.permission);

    return {
      admin: admin as unknown as AdminProfile,
      permissions,
      user: { id: user.id, email: user.email },
    };
  } catch {
    return null;
  }
}

export async function checkAdminPermission(permission: string): Promise<boolean> {
  const current = await getCurrentAdminProfile();
  if (!current || !current.admin.is_active) {
    return false;
  }

  if (current.admin.is_super_admin) {
    return true;
  }

  return current.permissions.includes(permission);
}

