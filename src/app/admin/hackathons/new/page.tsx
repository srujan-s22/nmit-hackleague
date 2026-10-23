import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { HackathonForm } from '@/components/hackathons/hackathon-form';

export const metadata: Metadata = {
  title: 'Create New Hackathon | NMIT HackLeague Admin',
  description: 'Author a new hackathon draft competition.',
};

export default async function NewHackathonPage() {
  const { admin, permissions } = await requireAdmin('manage_hackathons');

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="max-w-4xl space-y-6">
        <div className="mb-6">
          <Link
            href="/admin/hackathons"
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 mb-2"
          >
            &larr; Back to Hackathons
          </Link>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Create New Hackathon Draft
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Define event details, registration timeline, and participation guidelines. Rounds can be configured immediately after creating the draft.
          </p>
        </div>

        <HackathonForm isEdit={false} />
      </div>
    </AdminShell>
  );
}
