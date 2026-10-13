'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { resetPasswordAction } from '@/actions/auth-actions';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await resetPasswordAction({ password, confirmPassword });
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update password.');
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.redirectTo) {
        router.push(result.redirectTo);
      }
    });
  };

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <Link
          href="/login"
          className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1"
        >
          Sign In →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-md bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo asset="hackleague" size="md" className="mb-3" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Set New Password
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Choose a strong password containing uppercase, lowercase, and numbers.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5">
              <Alert
                variant="error"
                title="Error"
                onClose={() => setErrorMessage(null)}
              >
                {errorMessage}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="new-password"
              label="New Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isPending}
              error={fieldErrors.password?.[0]}
              helperText="Minimum 8 characters."
            />

            <Input
              id="confirm-new-password"
              label="Confirm New Password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isPending}
              error={fieldErrors.confirmPassword?.[0]}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isPending}
              disabled={isPending}
            >
              Update Password & Sign In
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border-subtle text-center text-xs">
            <Link href="/login" className="text-text-secondary hover:text-text-primary">
              ← Return to Sign In
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
