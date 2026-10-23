import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/ui/brand-logo';
import { ButtonLink } from '@/components/ui/button-link';

export const metadata: Metadata = {
  title: 'NMIT HackLeague',
  description: 'The hackathon portal for NMIT students.',
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Automatic Workspace Redirect for Authenticated Users (Option 1)
  if (user) {
    // 1. Check if administrator
    const { data: adminProfile } = await supabase
      .from('admin_profiles')
      .select('is_active, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfile) {
      if (adminProfile.is_active) {
        redirect('/admin');
      } else {
        redirect('/login');
      }
    }

    // 2. Check student profile & registration status
    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('registration_status')
      .eq('id', user.id)
      .maybeSingle();

    if (!studentProfile) {
      redirect('/onboarding');
    }

    switch (studentProfile.registration_status) {
      case 'approved':
        redirect('/student');
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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-surface-canvas text-text-primary">
      {/* Centered Minimal Content */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-xl bg-surface-canvas rounded-lg border border-border-default p-8 sm:p-12 shadow-sm flex flex-col items-center text-center space-y-8">
          {/* Enlarged NMIT Institutional Logo */}
          <div className="w-full flex justify-center pb-2">
            <BrandLogo asset="nmit" size="lg" priority className="max-w-full" />
          </div>

          {/* HackLeague Logo and Title in One Line */}
          <div className="space-y-3 w-full">
            <div className="flex items-center justify-center gap-3 sm:gap-3.5">
              <BrandLogo asset="hackleague" size="lg" priority />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
                NMIT HackLeague
              </h1>
            </div>

            <p className="text-base sm:text-lg text-text-secondary">
              The hackathon portal for NMIT students.
            </p>
          </div>

          {/* Two Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full justify-center">
            <ButtonLink href="/login" variant="primary" size="md" className="w-full sm:w-36 text-center">
              Login
            </ButtonLink>
            <ButtonLink href="/signup" variant="outline" size="md" className="w-full sm:w-36 text-center">
              Register
            </ButtonLink>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border-subtle bg-surface-canvas py-6 px-4 sm:px-8 text-center text-xs text-text-secondary">
        <p>© 2026 Nitte Meenakshi Institute of Technology. All rights reserved.</p>
      </footer>
    </div>
  );
}
