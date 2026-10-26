import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { getStudentDirectoryAction } from '@/actions/student-directory-actions';
import { StudentDirectoryClient } from './student-directory-client';

export const metadata: Metadata = {
  title: 'Student Directory — NMIT HackLeague Admin',
  description: 'Verified student directory, academic roster search, and institutional profiles.',
};

export default async function AdminStudentDirectoryPage() {
  const { admin, permissions } = await requireAdmin();

  const isAuthorized =
    admin.is_super_admin || permissions.includes('view_student_data');

  if (!isAuthorized) {
    redirect('/admin');
  }

  // Pre-fetch initial page of approved students
  const initialResult = await getStudentDirectoryAction({
    page: 1,
    pageSize: 20,
    sortBy: 'full_name',
    sortDirection: 'asc',
  });

  return (
    <AdminShell
      currentPath="/admin/students"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Student Directory"
          description="Approved students across all departments and years."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Student Directory' },
          ]}
        />

        <StudentDirectoryClient
          initialStudents={initialResult.students || []}
          initialTotalCount={initialResult.totalCount || 0}
          initialPage={initialResult.page || 1}
          initialPageSize={initialResult.pageSize || 20}
          initialTotalPages={initialResult.totalPages || 0}
          initialError={initialResult.error}
          isSuperAdmin={admin.is_super_admin}
        />
      </div>
    </AdminShell>
  );
}
