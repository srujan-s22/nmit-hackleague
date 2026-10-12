'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrorDemo, setShowErrorDemo] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingDemo(true);
    setInfoMessage(null);

    setTimeout(() => {
      setIsLoadingDemo(false);
      setInfoMessage(
        'Presentation Mode: Live authentication is deferred to Phase 4. No credentials were transmitted.'
      );
    }, 600);
  };

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Bar with official institutional banner logo */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus px-2 py-1 rounded-sm"
        >
          ← Return to Portal Hub
        </Link>
      </header>

      {/* Main Centered Authentication Presentation Card */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-md bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo asset="hackleague" size="lg" className="mb-4" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Sign In to HackLeague
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Nitte Meenakshi Institute of Technology
            </p>
          </div>

          {/* Interactive State Demo Controller */}
          <div className="mb-6 p-3 rounded-sm bg-surface-subtle border border-border-subtle text-xs text-text-secondary flex items-center justify-between">
            <span className="font-medium text-text-primary">Preview States:</span>
            <button
              type="button"
              onClick={() => {
                setShowErrorDemo((prev) => !prev);
                setInfoMessage(null);
              }}
              className="text-[11px] font-medium text-text-primary underline hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs cursor-pointer"
            >
              {showErrorDemo ? 'Clear error state' : 'Simulate error state'}
            </button>
          </div>

          {infoMessage && (
            <div className="mb-5">
              <Alert variant="info" onClose={() => setInfoMessage(null)}>
                {infoMessage}
              </Alert>
            </div>
          )}

          {showErrorDemo && (
            <div className="mb-5">
              <Alert
                variant="error"
                title="Authentication Failed"
                onClose={() => setShowErrorDemo(false)}
              >
                Invalid credentials. Please check your registered email address and password.
              </Alert>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="user-email"
              label="Registered Email Address"
              type="email"
              placeholder="e.g. yourname@example.com or name@nmit.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              error={showErrorDemo ? 'Please enter a valid email address' : undefined}
              helperText={!showErrorDemo ? 'Enter the email address used during registration' : undefined}
            />

            <Input
              id="user-password"
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              error={showErrorDemo ? 'Password is required' : undefined}
              helperText={!showErrorDemo ? 'Minimum 8 characters' : undefined}
            />

            <div className="flex items-center justify-between text-xs pt-1">
              <Checkbox id="remember-me" label="Remember workstation" />
              <button
                type="button"
                onClick={() => setInfoMessage('Password recovery will be enabled with Supabase Auth in Phase 4.')}
                className="text-text-secondary hover:text-text-primary underline focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                isLoading={isLoadingDemo}
              >
                Sign In to Portal
              </Button>
            </div>
          </form>

          {/* Footer Institutional Note */}
          <div className="mt-6 pt-6 border-t border-border-subtle/80 text-center">
            <p className="text-[11px] text-text-helper leading-relaxed">
              Protected by NMIT Identity Governance. Unauthorized access attempts are monitored and logged.
            </p>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center pt-4 border-t border-border-subtle/60 text-xs text-text-secondary">
        <p>© 2026 Nitte Meenakshi Institute of Technology. Autonomous Institution, Bengaluru.</p>
      </footer>
    </div>
  );
}
