import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { getPendingProfileChangeRequests } from '@/lib/student/queries';
import { VerificationsClient } from './verifications-client';

export const metadata: Metadata = {
  title: 'Student Verification & Corrections Queue — NMIT HackLeague Admin',
};

export default async function AdminVerificationsPage() {
  const { admin, permissions } = await requireAdmin();

  const canVerifyStudents =
    admin.is_super_admin || permissions.includes('verify_students');
  const canManageStudents =
    admin.is_super_admin || permissions.includes('manage_students');

  if (!canVerifyStudents && !canManageStudents) {
    redirect('/login');
  }

  const supabase = await createClient();

  const [studentsRes, profileChanges] = await Promise.all([
    canVerifyStudents
      ? supabase
          .from('profiles')
          .select('*')
          .in('registration_status', ['under_review', 'pending_verification'])
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    canManageStudents
      ? getPendingProfileChangeRequests()
      : Promise.resolve([]),
  ]);

  const students = studentsRes.data || [];

  return (
    <AdminShell
      currentPath="/admin/verifications"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Student Verifications & Corrections"
          description="Review institutional onboarding credentials, verify College IDs, and manage student profile correction requests."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Student Verifications' },
          ]}
        />

        <VerificationsClient
          initialStudents={students}
          initialProfileChanges={profileChanges}
          canVerifyStudents={canVerifyStudents}
          canManageStudents={canManageStudents}
        />
      </div>
    </AdminShell>
  );
}
