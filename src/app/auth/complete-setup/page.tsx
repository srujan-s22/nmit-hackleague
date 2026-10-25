'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { clearClientSessionCache } from '@/lib/session/client-session-cache';
import { createClient } from '@/lib/supabase/client';
import { completeAdminSetupAction } from '@/actions/auth-actions';

export default function CompleteAdminSetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  // Validate session and check onboarding expiration on mount
  useEffect(() => {
    let isCancelled = false;
    const supabase = createClient();

    async function checkUserSession() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (isCancelled) return;

        if (error || !user) {
          router.replace('/login');
          return;
        }

        setUserEmail(user.email || null);

        const appMeta = user.app_metadata || {};

        // Query admin_profiles to ensure consistent determination across both stores
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('must_change_password, onboarding_expires_at, is_super_admin')
          .eq('id', user.id)
          .maybeSingle();

        const mustChange = !profile?.is_super_admin && Boolean(
          appMeta.must_change_password || profile?.must_change_password
        );

        // If user already completed password setup, redirect to admin workspace
        if (!mustChange) {
          router.replace('/admin');
          return;
        }

        // Verify expiration timestamp
        const expiresAt = profile?.onboarding_expires_at || appMeta.onboarding_expires_at;
        if (expiresAt && typeof expiresAt === 'string') {
          if (new Date(expiresAt).getTime() < Date.now()) {
            setIsExpired(true);
          }
        }
      } catch {
        if (!isCancelled) {
          router.replace('/login');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingUser(false);
        }
      }
    }

    checkUserSession();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  // Live password validation checklist
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!isFormValid) {
      if (!passwordsMatch && confirmPassword) {
        setErrorMessage('Passwords do not match.');
      } else {
        setErrorMessage('Please ensure your new password satisfies all security requirements.');
      }
      return;
    }

    startTransition(async () => {
      try {
        const result = await completeAdminSetupAction({
          password,
          confirmPassword,
        });

        if (!result.success) {
          setErrorMessage(result.error || 'Failed to update password.');
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
          if (result.redirectTo) {
            setTimeout(() => {
              router.replace(result.redirectTo!);
            }, 2000);
          }
          return;
        }

        setSuccessMessage('Password successfully updated! Redirecting to Administrator workspace...');
        setTimeout(() => {
          router.replace('/admin');
          router.refresh();
        }, 1200);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    });
  };

  const handleSignOut = async () => {
    clearClientSessionCache();
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch('/auth/signout', { method: 'POST' });
    } catch {
      // Continue redirect
    } finally {
      router.replace('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      {/* Top Header */}
      <header className="h-16 border-b border-border-subtle bg-surface-canvas px-4 sm:px-6 flex items-center justify-between">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-xs font-semibold text-text-secondary hover:text-status-error-text transition-colors px-3 py-1.5 rounded-sm border border-border-subtle hover:border-status-error-border"
        >
          Sign Out
        </button>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg bg-surface-canvas rounded-lg border border-border-subtle p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo asset="hackleague" size="md" className="mb-3" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Mandatory Administrator Setup
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-md">
              For security, you must replace your temporary initial credential with a strong permanent password before accessing the administration portal.
            </p>
            {userEmail && (
              <span className="mt-2 text-xs font-mono bg-surface-subtle border border-border-subtle px-2.5 py-1 rounded-sm text-text-primary">
                {userEmail}
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="mb-5">
              <Alert variant="error" title="Setup Error" onClose={() => setErrorMessage(null)}>
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

          {isLoadingUser ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-6 h-6 border-2 border-brand-nmit-blue border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-text-secondary">Verifying onboarding credentials...</p>
            </div>
          ) : isExpired ? (
            <div className="py-6 text-center space-y-4">
              <div className="rounded-md bg-status-error-bg border border-status-error-border p-4 text-left">
                <h2 className="text-sm font-semibold text-status-error-text">
                  Onboarding Credentials Expired
                </h2>
                <p className="text-xs text-text-primary mt-1 leading-relaxed">
                  The 24-hour setup window for this temporary password has expired. For institutional security, expired temporary credentials cannot unlock normal dashboard functionality.
                </p>
                <p className="text-xs text-text-secondary mt-2">
                  Please contact the Super Admin to reissue a fresh onboarding credential for your account.
                </p>
              </div>

              <div className="pt-2">
                <Button type="button" variant="secondary" onClick={handleSignOut} className="w-full">
                  Sign Out & Return to Login
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New Password */}
              <div>
                <Input
                  id="new-password"
                  label="New Permanent Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending || Boolean(successMessage)}
                  required
                  error={fieldErrors.password?.[0]}
                  rightAddon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="text-text-secondary hover:text-text-primary focus:outline-none p-1 rounded-sm focus:ring-2 focus:ring-border-focus transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  }
                />
              </div>

              {/* Confirm Password */}
              <div>
                <Input
                  id="confirm-password"
                  label="Confirm Permanent Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isPending || Boolean(successMessage)}
                  required
                  error={fieldErrors.confirmPassword?.[0]}
                  rightAddon={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="text-text-secondary hover:text-text-primary focus:outline-none p-1 rounded-sm focus:ring-2 focus:ring-border-focus transition-colors"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  }
                />
              </div>

              {/* Password Policy Live Requirements Checklist */}
              <div className="rounded-md border border-border-subtle bg-surface-subtle/40 p-3 space-y-1.5 text-xs">
                <span className="font-semibold text-text-primary block mb-1">
                  Password Complexity Criteria:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-status-success-text' : 'text-text-secondary'}`}>
                    <span className="font-bold">{hasMinLength ? '✓' : '○'}</span>
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-status-success-text' : 'text-text-secondary'}`}>
                    <span className="font-bold">{hasUppercase ? '✓' : '○'}</span>
                    <span>Uppercase letter (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-status-success-text' : 'text-text-secondary'}`}>
                    <span className="font-bold">{hasLowercase ? '✓' : '○'}</span>
                    <span>Lowercase letter (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-status-success-text' : 'text-text-secondary'}`}>
                    <span className="font-bold">{hasNumber ? '✓' : '○'}</span>
                    <span>At least one number (0-9)</span>
                  </div>
                </div>
                <div className={`pt-1 border-t border-border-subtle flex items-center gap-1.5 ${passwordsMatch ? 'text-status-success-text' : 'text-text-secondary'}`}>
                  <span className="font-bold">{passwordsMatch ? '✓' : '○'}</span>
                  <span>Passwords match exactly</span>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={!isFormValid || isPending || Boolean(successMessage)}
                >
                  {isPending ? 'Verifying & Updating...' : 'Set Permanent Password & Continue'}
                </Button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-xs text-text-secondary hover:text-text-primary underline"
                >
                  Need help? Sign out of temporary session
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
