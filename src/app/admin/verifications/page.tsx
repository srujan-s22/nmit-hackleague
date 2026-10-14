import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { VerificationsClient } from './verifications-client';

export const metadata: Metadata = {
  title: 'Student Verification Queue — NMIT HackLeague Admin',
};

export default async function AdminVerificationsPage() {
  const { admin, permissions } = await requireAdmin('verify_students');
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('profiles')
    .select('*')
    .in('registration_status', ['under_review', 'pending_verification'])
    .order('created_at', { ascending: true });

  return (
    <AdminShell
      currentPath="/admin/verifications"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Student Registration Verifications"
          description="Review institutional eligibility, verify physical College ID credentials, and approve student participant accounts."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Student Verifications' },
          ]}
        />

        <VerificationsClient initialStudents={students || []} />
      </div>
    </AdminShell>
  );
}
