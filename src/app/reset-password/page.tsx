'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { resetPasswordSchema } from '@/lib/validation/auth-schemas';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let isCancelled = false;

    // 1. Subscribe to auth state transitions (captures PASSWORD_RECOVERY or SIGNED_IN event)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isCancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasValidSession(true);
        setIsCheckingSession(false);
        setErrorMessage(null);
      }
    });

    // 3. Establish session: explicit setSession for implicit-flow hash tokens, or fallback to existing session
    async function establishRecoverySession() {
      // Inspect URL hash for explicit error parameters (e.g. #error=access_denied&error_code=otp_expired)
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hashError = hashParams.get('error');
        const hashErrorDesc = hashParams.get('error_description');
        const hashErrorCode = hashParams.get('error_code');

        if (hashError || hashErrorCode) {
          if (isCancelled) return;
          setErrorMessage(
            hashErrorDesc || 'The password reset link is invalid or has expired. Please request a new link.'
          );
          setIsCheckingSession(false);
          setHasValidSession(false);
          return;
        }
      }
      try {
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (isCancelled) return;

            if (setSessionError) {
              setErrorMessage(setSessionError.message || 'Failed to establish recovery session.');
              setHasValidSession(false);
              setIsCheckingSession(false);
              return;
            }

            if (data?.session) {
              setHasValidSession(true);
              setIsCheckingSession(false);
              setErrorMessage(null);
              // Clean sensitive tokens from URL immediately
              window.history.replaceState(null, '', window.location.pathname);
              return;
            }
          }
        }

        // Fallback: check if an active session already exists (e.g. PKCE or page refresh)
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (isCancelled) return;

        if (sessionError) {
          setErrorMessage(sessionError.message || 'Failed to verify recovery session.');
          setHasValidSession(false);
          setIsCheckingSession(false);
          return;
        }

        if (session) {
          setHasValidSession(true);
          setIsCheckingSession(false);
          setErrorMessage(null);
        } else {
          setHasValidSession(false);
          setIsCheckingSession(false);
          setErrorMessage(
            'No active password recovery session found. Please use the link sent to your email or request a new one.'
          );
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred while verifying session.';
        setErrorMessage(msg);
        setHasValidSession(false);
        setIsCheckingSession(false);
      }
    }

    establishRecoverySession();

    // 4. Relaxed fallback safety timeout (12s) to prevent infinite loading if the network hangs
    const timer = setTimeout(() => {
      if (isCancelled) return;
      setIsCheckingSession((current) => {
        if (current) {
          setErrorMessage(
            'Authentication timed out or the recovery link is invalid. Please request a new link.'
          );
          setHasValidSession(false);
          return false;
        }
        return false;
      });
    }, 12000);

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    if (!hasValidSession) {
      setErrorMessage('Cannot update password: no valid recovery session established.');
      return;
    }

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setFieldErrors(flattened.fieldErrors);
      setErrorMessage(
        flattened.formErrors[0] ||
          flattened.fieldErrors.password?.[0] ||
          flattened.fieldErrors.confirmPassword?.[0] ||
          'Passwords do not meet requirements or do not match.'
      );
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error: updateError } = await supabase.auth.updateUser({
          password: parsed.data.password,
        });

        if (updateError) {
          setErrorMessage(updateError.message || 'Failed to update password. Please try again.');
          return;
        }

        setSuccessMessage('Password updated successfully! Redirecting to sign in...');
        setTimeout(() => {
          router.push('/login?message=Password+updated+successfully.+Please+sign+in.');
        }, 1500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setErrorMessage(msg);
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
                title="Recovery Session Error"
                onClose={() => setErrorMessage(null)}
              >
                {errorMessage}
              </Alert>
            </div>
          )}

          {successMessage && (
            <div className="mb-5">
              <Alert variant="success" title="Success">
                {successMessage}
              </Alert>
            </div>
          )}

          {isCheckingSession ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-text-secondary">Verifying recovery session...</p>
            </div>
          ) : !hasValidSession ? (
            <div className="mt-4 text-center space-y-4">
              <p className="text-xs text-text-muted">
                To protect account security, passwords can only be changed with an active recovery session.
              </p>
              <div>
                <Link
                  href="/forgot-password"
                  className="inline-block text-xs font-semibold text-brand-primary hover:underline"
                >
                  Request a New Password Reset Link →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                id="new-password"
                label="New Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isPending || Boolean(successMessage)}
                error={fieldErrors.password?.[0]}
                helperText="Minimum 8 characters with uppercase, lowercase, and numbers."
              />

              <Input
                id="confirm-new-password"
                label="Confirm New Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isPending || Boolean(successMessage)}
                error={fieldErrors.confirmPassword?.[0]}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-2"
                isLoading={isPending}
                disabled={isPending || Boolean(successMessage)}
              >
                Update Password & Sign In
              </Button>
            </form>
          )}

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
