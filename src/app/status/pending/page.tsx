import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/ui/brand-logo';

export default async function PendingStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    redirect('/login');
  }

  // Redirect if status is not under review
  if (profile.registration_status === 'draft') {
    redirect('/onboarding');
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
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1 border border-border-subtle rounded-sm hover:bg-surface-canvas cursor-pointer"
          >
            Sign Out
          </button>
        </form>
      </header>

      {/* Main Status Display */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-lg bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card text-center">
          <div className="w-12 h-12 rounded-full bg-brand-warning/10 text-brand-warning mx-auto flex items-center justify-center mb-4">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </div>

          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-warning bg-brand-warning/10 px-2.5 py-1 rounded-xs inline-block mb-3">
            Under Review
          </span>

          <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mb-2">
            Registration Under Administrative Review
          </h1>

          <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
            Your details and College ID have been submitted. An administrator will review them, usually within 1–2 working days.
          </p>

          <div className="bg-surface-subtle rounded-sm border border-border-subtle p-4 text-left text-xs mb-6">
            <h2 className="font-semibold text-text-primary mb-3">Submitted Details</h2>
            <div className="grid grid-cols-2 gap-2 text-text-secondary">
              <div>Student Name: <strong className="text-text-primary block">{profile.full_name}</strong></div>
              <div>USN: <strong className="font-mono text-text-primary block">{profile.usn}</strong></div>
              <div>Branch: <strong className="text-text-primary block">{profile.branch}</strong></div>
              <div>Academic Year: <strong className="text-text-primary block">Year {profile.academic_year}</strong></div>
            </div>
          </div>

          <p className="text-[11px] text-text-muted">
            You can join hackathons and form teams once your account is approved.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
        <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
      </footer>
    </div>
  );
}
