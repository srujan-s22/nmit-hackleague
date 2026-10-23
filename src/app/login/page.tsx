'use client';

import React, { useState, useTransition, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { loginAction } from '@/actions/auth-actions';

function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const redirectToParam = searchParams.get('redirectTo') || searchParams.get('next') || undefined;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(urlError);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await loginAction({ email, password, redirectTo: redirectToParam });
      if (!result.success) {
        setErrorMessage(result.error || 'Authentication failed. Please check your credentials.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  };

  return (
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

      {errorMessage && (
        <div className="mb-5">
          <Alert
            variant="error"
            title="Authentication Error"
            onClose={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="user-email"
          label="Registered Email Address"
          type="email"
          placeholder="student@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isPending}
          autoComplete="email"
          error={fieldErrors.email?.[0]}
        />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="user-password"
              className="block text-xs font-medium text-text-secondary"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="user-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isPending}
            autoComplete="current-password"
            error={fieldErrors.password?.[0]}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={isPending}
          disabled={isPending}
        >
          Sign In
        </Button>
      </form>

      {/* Footer Actions */}
      <div className="mt-6 pt-6 border-t border-border-subtle text-center">
        <p className="text-xs text-text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs"
          >
            Register as a Student
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
        <Suspense fallback={<div className="text-sm text-text-secondary">Loading...</div>}>
          <LoginCard />
        </Suspense>
      </main>

      {/* Institutional Security Notice Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
        <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
        <p className="mt-1">
          Authorized institutional access only. All actions are logged and audited.
        </p>
      </footer>
    </div>
  );
}
