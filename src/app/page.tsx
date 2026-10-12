import React from 'react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      {/* Institutional Top Banner */}
      <header className="border-b border-border-subtle bg-surface-canvas py-4 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo asset="nmit" size="sm" priority />
          <div className="flex items-center gap-3">
            <Badge variant="success" dot>Phase 2 Baseline Active</Badge>
            <span className="text-xs text-text-helper hidden md:inline">
              Nitte Meenakshi Institute of Technology, Bengaluru
            </span>
          </div>
        </div>
      </header>

      {/* Main Hub Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-10 sm:py-16 flex flex-col gap-12">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-5">
          <BrandLogo asset="hackleague" size="lg" priority />

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary leading-tight">
            NMIT HackLeague Portal
          </h1>

          <p className="text-base text-text-secondary leading-relaxed max-w-2xl">
            Official institutional hackathon management and team collaboration platform.
            Phase 2 establishes the restrained design token architecture, official branding integration,
            and role-based page shells.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <ButtonLink href="/login" variant="primary" size="md">
              Institutional Sign In
            </ButtonLink>
            <ButtonLink href="/preview/showcase" variant="outline" size="md">
              Explore Component Showcase
            </ButtonLink>
          </div>
        </div>

        {/* Role Shell Previews Grid */}
        <section className="space-y-4">
          <div className="text-center sm:text-left">
            <h2 className="text-lg font-bold text-text-primary">Role-Based Workspace Shells</h2>
            <p className="text-xs text-text-secondary">
              Inspect responsive navigation hierarchies and layout primitives for each institutional stakeholder.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="info">Student Role</Badge>
                  <span className="text-[11px] font-mono text-text-helper">PREVIEW</span>
                </div>
                <CardTitle>Student Workspace Shell</CardTitle>
                <CardDescription>
                  For student participants, team formation, milestone submissions, and score tracking.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-text-secondary space-y-1.5 list-disc list-inside">
                  <li>Active hackathon cards & progress tracking</li>
                  <li>Milestone timeline & submission portal</li>
                  <li>Responsive mobile drawer navigation</li>
                </ul>
              </CardContent>
              <CardFooter>
                <ButtonLink href="/preview/shells/student" variant="outline" size="sm" fullWidth>
                  Open Student Shell
                </ButtonLink>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="neutral">Organizer Role</Badge>
                  <span className="text-[11px] font-mono text-text-helper">PREVIEW</span>
                </div>
                <CardTitle>Administrator Shell</CardTitle>
                <CardDescription>
                  For departmental club organizers, registration review panels, and jury scoring.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-text-secondary space-y-1.5 list-disc list-inside">
                  <li>Operational event metrics & attendance</li>
                  <li>Tabular registration verification queue</li>
                  <li>Round scoring & evaluation review</li>
                </ul>
              </CardContent>
              <CardFooter>
                <ButtonLink href="/preview/shells/admin" variant="outline" size="sm" fullWidth>
                  Open Admin Shell
                </ButtonLink>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="warning">Governance Role</Badge>
                  <span className="text-[11px] font-mono text-text-helper">PREVIEW</span>
                </div>
                <CardTitle>Super Admin Shell</CardTitle>
                <CardDescription>
                  For college executive authorities, academic policy enforcement, and audit retention.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-text-secondary space-y-1.5 list-disc list-inside">
                  <li>Institutional system health & club chapters</li>
                  <li>Cross-departmental role governance</li>
                  <li>Immutable audit log & security trail</li>
                </ul>
              </CardContent>
              <CardFooter>
                <ButtonLink href="/preview/shells/super-admin" variant="outline" size="sm" fullWidth>
                  Open Super Admin Shell
                </ButtonLink>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Technical Architecture Notes */}
        <section className="p-6 rounded-md border border-border-subtle bg-surface-subtle">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Phase 2 Architectural Specification</h3>
              <p className="text-xs text-text-secondary">Next.js App Router • Tailwind CSS v4 • WCAG 2.1 AA Compliant</p>
            </div>
            <Badge variant="neutral">Autonomous Institution</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-text-secondary">
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">Zero Premature Auth</span>
              All preview routes operate without live database mutations or active sessions. Real Supabase integration commences in Phase 3 & 4.
            </div>
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">Strict Vector Branding</span>
              Rendered strictly using official NMIT and HackLeague SVG assets with native aspect ratios. Secondary raster assets excluded.
            </div>
            <div>
              <span className="font-semibold text-text-primary block mb-0.5">Verified WCAG Contrast</span>
              All color tokens mathematically verified against WCAG standards (Body text 14.91:1, Borders 3.46:1, Focus ring 14.91:1).
            </div>
          </div>
        </section>
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-border-subtle bg-surface-canvas py-6 px-4 sm:px-8 text-center text-xs text-text-secondary">
        <p>© 2026 Nitte Meenakshi Institute of Technology. All rights reserved.</p>
      </footer>
    </div>
  );
}
