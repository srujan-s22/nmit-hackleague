'use client';

import React, { useState, useTransition, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { verifyOtpAction, resendOtpAction } from '@/actions/auth-actions';

const EMAIL_STORAGE_KEY = 'nmit_pending_verification_email';
const COOLDOWN_STORAGE_KEY = 'nmit_resend_cooldown_expiry';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';

  // Lazy state initializers read query param or cached sessionStorage without cascading effects
  const [email, setEmail] = useState<string>(() => {
    if (emailParam) return emailParam;
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem(EMAIL_STORAGE_KEY) || '';
      } catch {
        return '';
      }
    }
    return '';
  });

  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, setIsResending] = useState(false);

  const [cooldown, setCooldown] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const expiry = sessionStorage.getItem(COOLDOWN_STORAGE_KEY);
        if (expiry) {
          const remainingSeconds = Math.ceil((parseInt(expiry, 10) - Date.now()) / 1000);
          if (remainingSeconds > 0) return remainingSeconds;
          sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
        }
      } catch {
        return 0;
      }
    }
    return 0;
  });

  // Synchronize emailParam to sessionStorage if provided
  useEffect(() => {
    if (emailParam) {
      try {
        sessionStorage.setItem(EMAIL_STORAGE_KEY, emailParam);
      } catch {
        // Non-blocking if storage is restricted
      }
    }
  }, [emailParam]);

  // Handle active countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          try {
            sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
          } catch {
            // Non-blocking
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    try {
      sessionStorage.setItem(EMAIL_STORAGE_KEY, newEmail);
    } catch {
      // Non-blocking
    }
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
    setToken(digitsOnly);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const digitsOnly = pastedText.replace(/\D/g, '').slice(0, 6);
    if (digitsOnly) {
      setToken(digitsOnly);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email) {
      setErrorMessage('Please provide your registered email address.');
      return;
    }

    if (token.length !== 6) {
      setErrorMessage('Please enter all 6 digits of the verification code.');
      return;
    }

    startTransition(async () => {
      const result = await verifyOtpAction({ email, token });
      if (!result.success) {
        setErrorMessage(result.error || 'Verification failed. Please check your code.');
      } else if (result.redirectTo) {
        try {
          sessionStorage.removeItem(EMAIL_STORAGE_KEY);
          sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
        } catch {
          // Non-blocking
        }
        router.push(result.redirectTo);
      }
    });
  };

  const handleResend = async () => {
    if (!email) {
      setErrorMessage('Please provide your email address to resend the code.');
      return;
    }
    if (cooldown > 0 || isResending) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsResending(true);

    try {
      const result = await resendOtpAction(email);
      if (result.success) {
        setSuccessMessage(result.message || 'A new verification code has been dispatched.');
        setCooldown(60);
        try {
          sessionStorage.setItem(COOLDOWN_STORAGE_KEY, (Date.now() + 60000).toString());
        } catch {
          // Non-blocking
        }
      } else {
        setErrorMessage(result.error || 'Failed to resend code.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
      <div className="flex flex-col items-center text-center mb-6">
        <BrandLogo asset="hackleague" size="md" className="mb-3" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
          Verify Your Email
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary mt-1">
          Enter the 6-digit verification code sent to your registered email address.
        </p>
      </div>

      {successMessage && (
        <div className="mb-5">
          <Alert variant="success" onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        </div>
      )}

      {errorMessage && (
        <div className="mb-5">
          <Alert
            variant="error"
            title="Verification Error"
            onClose={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="verify-email"
          label="Registered Email Address"
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          required
          disabled={isPending || !!emailParam}
          helperText={emailParam ? undefined : 'Enter the email you used during registration.'}
        />

        <Input
          id="verify-token"
          label="6-Digit Verification Code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="123456"
          maxLength={6}
          value={token}
          onChange={handleTokenChange}
          onPaste={handlePaste}
          required
          disabled={isPending}
          autoComplete="one-time-code"
          helperText="Check your spam/junk folder if you do not see it in your inbox."
        />

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={isPending}
          disabled={isPending || token.length !== 6 || !email}
        >
          Verify Code & Continue
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-border-subtle flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || isPending || cooldown > 0 || !email}
          className="text-text-primary hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer transition-colors"
        >
          {isResending
            ? 'Sending...'
            : cooldown > 0
            ? `Resend Code in ${cooldown}s`
            : 'Resend Code'}
        </button>
        <Link href="/login" className="text-text-secondary hover:text-text-primary transition-colors">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function VerifyPage() {
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
        <Suspense fallback={<div className="text-sm text-text-secondary">Loading verification...</div>}>
          <VerifyContent />
        </Suspense>
      </main>

      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
        <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
      </footer>
    </div>
  );
}
