import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { recoverStudentProfile } from '@/lib/auth/profile-recovery';
import { OnboardingClient } from './onboarding-client';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Administrators never onboard as students.
  const { data: adminRow } = await supabase
    .from('admin_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (adminRow) {
    redirect('/admin');
  }

  // Fetch student profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  let recoveryError: string | null = null;

  // Safe recovery for legitimate confirmed students whose profile was not created
  if (!profile) {
    const recovery = await recoverStudentProfile(user);
    if (recovery.success && recovery.profile) {
      profile = recovery.profile;
    } else {
      recoveryError = recovery.error || 'Your student registration profile is missing and could not be restored.';
    }
  }

  // If still no profile, render an institutional blocked card instead of looping to /login
  if (!profile) {
    return (
      <div className="min-h-screen bg-surface-subtle flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
        <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
          <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
            <BrandLogo asset="nmit" size="sm" priority />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-text-secondary hidden sm:inline">
              Logged in as <strong className="text-text-primary">{user.email}</strong>
            </span>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1 border border-border-subtle rounded-sm hover:bg-surface-canvas cursor-pointer"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 max-w-lg mx-auto w-full py-12 flex flex-col justify-center">
          <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
            <div className="flex flex-col items-center text-center mb-6">
              <BrandLogo asset="hackleague" size="md" className="mb-3" />
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                Profile Registration Issue
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary mt-1">
                Your email address is verified, but your student registration profile could not be loaded.
              </p>
            </div>

            <div className="mb-6">
              <Alert variant="error" title="Onboarding Blocked">
                {recoveryError}
              </Alert>
            </div>

            <div className="flex flex-col gap-3">
              <form action="/auth/signout" method="POST">
                <Button type="submit" variant="primary" className="w-full">
                  Sign Out and Try Again
                </Button>
              </form>
              <Link
                href="/"
                className="text-xs text-center text-text-secondary hover:text-text-primary underline transition-colors"
              >
                Return to Home
              </Link>
            </div>
          </div>
        </main>

        <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
          <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
        </footer>
      </div>
    );
  }

  // If not in draft, route to appropriate status page
  if (profile.registration_status === 'under_review' || profile.registration_status === 'pending_verification') {
    redirect('/status/pending');
  }
  if (profile.registration_status === 'approved') {
    redirect('/student');
  }
  if (profile.registration_status === 'correction_required' || profile.registration_status === 'rejected') {
    redirect('/status/rejected');
  }
  if (profile.registration_status === 'suspended') {
    redirect('/status/suspended');
  }

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Institutional Top Bar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-text-secondary hidden sm:inline">
            Logged in as <strong className="text-text-primary">{profile.email}</strong>
          </span>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1 border border-border-subtle rounded-sm hover:bg-surface-canvas cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full py-8">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Student Onboarding & Verification
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Upload your College ID to complete registration.
          </p>
        </div>

        <OnboardingClient profile={profile} />
      </main>

      {/* Institutional Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
        <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
      </footer>
    </div>
  );
}
