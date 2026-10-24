import React from 'react';
import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { getStudentDetailAction } from '@/actions/student-directory-actions';
import { StudentDetailStandaloneClient } from './student-detail-client';

interface AdminStudentDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Student Profile & Progression — NMIT HackLeague Admin',
};

export default async function AdminStudentDetailPage({ params }: AdminStudentDetailPageProps) {
  const { id } = await params;
  const { admin, permissions } = await requireAdmin();

  const isAuthorized =
    admin.is_super_admin || permissions.includes('view_student_data');

  if (!isAuthorized) {
    redirect('/admin');
  }

  const res = await getStudentDetailAction(id);
  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <AdminShell
      currentPath="/admin/students"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title={res.data.full_name}
          description="Detailed verified student profile, contact information, and competition history."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Student Directory', href: '/admin/students' },
            { label: res.data.full_name },
          ]}
        />

        <StudentDetailStandaloneClient initialData={res.data} />
      </div>
    </AdminShell>
  );
}
