import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/ui/brand-logo';

export default async function SuspendedStatusPage() {
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

  if (profile.registration_status !== 'suspended') {
    redirect('/login');
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

      {/* Main Suspended Card */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-lg bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card text-center">
          <div className="w-12 h-12 rounded-full bg-brand-error/10 text-brand-error mx-auto flex items-center justify-center mb-4">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></svg>
          </div>

          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-xs inline-block mb-3">
            Account Suspended
          </span>

          <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mb-2">
            Institutional Access Suspended
          </h1>

          <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
            Your HackLeague account has been suspended by an administrator. Access to hackathons, team collaboration, and profile modifications is restricted.
          </p>

          <div className="bg-surface-subtle rounded-sm border border-border-subtle p-4 text-left text-xs mb-6">
            <h2 className="font-semibold text-text-primary mb-1">Account Notice:</h2>
            <p className="text-text-secondary">
              Student USN: <strong className="font-mono text-text-primary">{profile.usn}</strong>
            </p>
            <p className="text-text-secondary mt-1">
              Registered Email: <strong className="text-text-primary">{profile.email}</strong>
            </p>
          </div>

          <p className="text-[11px] text-text-muted leading-relaxed">
            To appeal, contact the HackLeague committee or the Dean of Student Affairs.
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
