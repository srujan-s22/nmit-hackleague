'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { signupAction } from '@/actions/auth-actions';
import { BRANCHES, ACADEMIC_YEARS, GENDERS } from '@/lib/validation/auth-schemas';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    usn: '',
    email: '',
    phone: '+91',
    branch: 'CSE',
    academicYear: 1,
    sex: 'Male' as (typeof GENDERS)[number],
    dateOfBirth: '',
    password: '',
    confirmPassword: '',
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'academicYear' ? Number(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match.');
      setFieldErrors({ confirmPassword: ['Passwords do not match.'] });
      return;
    }

    startTransition(async () => {
      const result = await signupAction({
        full_name: formData.fullName,
        usn: formData.usn,
        email: formData.email,
        phone: formData.phone,
        branch: formData.branch as (typeof BRANCHES)[number],
        academic_year: formData.academicYear as (typeof ACADEMIC_YEARS)[number],
        sex: formData.sex,
        date_of_birth: formData.dateOfBirth,
        password: formData.password,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Registration failed. Please check your details.');
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
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <Link
          href="/login"
          className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus px-2 py-1 rounded-sm"
        >
          Already registered? Sign In →
        </Link>
      </header>

      {/* Main Registration Card */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-xl bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo asset="hackleague" size="md" className="mb-3" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Student Registration
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Create your NMIT HackLeague account.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5">
              <Alert
                variant="error"
                title="Registration Error"
                onClose={() => setErrorMessage(null)}
              >
                {errorMessage}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full Name & USN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="signup-fullname"
                label="Full Name"
                name="fullName"
                placeholder="Rohan Verma"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={isPending}
                error={fieldErrors.full_name?.[0]}
              />

              <Input
                id="signup-usn"
                label="University Seat Number (USN)"
                name="usn"
                placeholder="1NT22IS050"
                value={formData.usn}
                onChange={handleChange}
                required
                disabled={isPending}
                helperText="Must match your official college records."
                error={fieldErrors.usn?.[0]}
              />
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="signup-email"
                label="Email Address"
                name="email"
                type="email"
                placeholder="student@example.com"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isPending}
                helperText="Personal or college email accepted."
                error={fieldErrors.email?.[0]}
              />

              <Input
                id="signup-phone"
                label="Phone Number"
                name="phone"
                placeholder="+919876543210"
                value={formData.phone}
                onChange={handleChange}
                required
                disabled={isPending}
                helperText="Include +91 country code."
                error={fieldErrors.phone?.[0]}
              />
            </div>

            {/* Branch, Academic Year & Sex */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="signup-branch" className="block text-xs font-medium text-text-secondary mb-1">
                  Branch
                </label>
                <select
                  id="signup-branch"
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  disabled={isPending}
                  className="w-full h-10 px-3 text-xs bg-surface-canvas border border-border-subtle rounded-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                {fieldErrors.branch && (
                  <p className="mt-1 text-xs text-brand-error">{fieldErrors.branch[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="signup-year" className="block text-xs font-medium text-text-secondary mb-1">
                  Academic Year
                </label>
                <select
                  id="signup-year"
                  name="academicYear"
                  value={formData.academicYear}
                  onChange={handleChange}
                  disabled={isPending}
                  className="w-full h-10 px-3 text-xs bg-surface-canvas border border-border-subtle rounded-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  {ACADEMIC_YEARS.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
                {fieldErrors.academic_year && (
                  <p className="mt-1 text-xs text-brand-error">{fieldErrors.academic_year[0]}</p>
                )}
              </div>

              <div>
                <label htmlFor="signup-sex" className="block text-xs font-medium text-text-secondary mb-1">
                  Sex
                </label>
                <select
                  id="signup-sex"
                  name="sex"
                  value={formData.sex}
                  onChange={handleChange}
                  disabled={isPending}
                  className="w-full h-10 px-3 text-xs bg-surface-canvas border border-border-subtle rounded-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                {fieldErrors.sex && (
                  <p className="mt-1 text-xs text-brand-error">{fieldErrors.sex[0]}</p>
                )}
              </div>
            </div>

            {/* Date of Birth */}
            <div className="grid grid-cols-1 gap-4">
              <Input
                id="signup-dob"
                label="Date of Birth"
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                required
                disabled={isPending}
                helperText="Must be at least 15 years of age."
                error={fieldErrors.date_of_birth?.[0]}
              />
            </div>

            {/* Password & Confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="signup-password"
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isPending}
                helperText="Min 8 chars, uppercase, lowercase, number."
                error={fieldErrors.password?.[0]}
              />

              <Input
                id="signup-confirm-password"
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isPending}
                error={fieldErrors.confirmPassword?.[0]}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-4"
              isLoading={isPending}
              disabled={isPending}
            >
              Create Account & Proceed to Verification
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border-subtle text-center">
            <p className="text-xs text-text-secondary">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-text-muted py-4 border-t border-border-subtle/80">
        <p>Institutional Hackathon Management Platform • NMIT HackLeague v1.0</p>
      </footer>
    </div>
  );
}
