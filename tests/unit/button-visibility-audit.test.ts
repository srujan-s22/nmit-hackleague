import fs from 'fs';
import path from 'path';
import { getButtonClasses } from '../../src/components/ui/button-styles';

// WCAG relative luminance & contrast ratio calculation
function sRGBtoLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function getContrastRatio(hex1: string, hex2: string): number {
  const L1 = getRelativeLuminance(hex1);
  const L2 = getRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function runButtonVisibilityTests() {
  console.log('=== NMIT HackLeague: Button Text Visibility & Contrast Regression Audit ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // 1. Shared Button Component Variants
  console.log('[Suite 1: Shared Button Component Variants & Class Token Mapping]');
  const primaryClasses = getButtonClasses({ variant: 'primary', fullWidth: true });
  assert(primaryClasses.includes('bg-surface-inverse'), 'Primary button uses bg-surface-inverse');
  assert(primaryClasses.includes('text-text-inverse'), 'Primary button uses text-text-inverse');
  assert(primaryClasses.includes('w-full'), 'Full width flag generates w-full');
  assert(primaryClasses.includes('focus:ring-border-focus'), 'Primary button has visible focus ring token');
  assert(primaryClasses.includes('disabled:opacity-50'), 'Primary button includes disabled opacity feedback');
  assert(!primaryClasses.includes('bg-primary'), 'Primary button does not use legacy undefined bg-primary utility');

  const secondaryClasses = getButtonClasses({ variant: 'secondary' });
  assert(secondaryClasses.includes('bg-surface-subtle'), 'Secondary button uses bg-surface-subtle');
  assert(secondaryClasses.includes('text-text-primary'), 'Secondary button uses text-text-primary');
  assert(secondaryClasses.includes('border-border-subtle'), 'Secondary button includes border-border-subtle');

  const outlineClasses = getButtonClasses({ variant: 'outline' });
  assert(outlineClasses.includes('text-text-primary'), 'Outline button uses text-text-primary');
  assert(outlineClasses.includes('border-border-interactive'), 'Outline button has border-border-interactive');

  const destructiveClasses = getButtonClasses({ variant: 'destructive' });
  assert(destructiveClasses.includes('bg-status-error-bg'), 'Destructive button uses bg-status-error-bg');
  assert(destructiveClasses.includes('text-status-error-text'), 'Destructive button uses text-status-error-text');

  // 2. WCAG Contrast Ratios
  console.log('\n[Suite 2: WCAG 2.1 Contrast Ratio Verification for All Button Variants]');
  const tokenPalette: Record<string, string> = {
    'surface-inverse': '#18181B',
    'text-inverse': '#FFFFFF',
    'surface-canvas': '#FFFFFF',
    'surface-subtle': '#F9FAFB',
    'text-primary': '#18181B',
    'text-secondary': '#52525B',
    'status-error-bg': '#F8E8E6',
    'status-error-text': '#B71C1C',
  };

  const primaryContrast = getContrastRatio(tokenPalette['surface-inverse'], tokenPalette['text-inverse']);
  assert(primaryContrast >= 7.0, `Primary button contrast ratio is WCAG AAA compliant (Ratio: ${primaryContrast.toFixed(2)}:1 >= 7.0:1)`);

  const secondaryContrast = getContrastRatio(tokenPalette['surface-subtle'], tokenPalette['text-primary']);
  assert(secondaryContrast >= 7.0, `Secondary button contrast ratio is WCAG AAA compliant (Ratio: ${secondaryContrast.toFixed(2)}:1 >= 7.0:1)`);

  const outlineContrast = getContrastRatio(tokenPalette['surface-canvas'], tokenPalette['text-primary']);
  assert(outlineContrast >= 7.0, `Outline button contrast ratio is WCAG AAA compliant (Ratio: ${outlineContrast.toFixed(2)}:1 >= 7.0:1)`);

  const destructiveContrast = getContrastRatio(tokenPalette['status-error-bg'], tokenPalette['status-error-text']);
  assert(destructiveContrast >= 4.5, `Destructive button contrast ratio is WCAG AA compliant (Ratio: ${destructiveContrast.toFixed(2)}:1 >= 4.5:1)`);

  const badgeContrast = getContrastRatio(tokenPalette['status-error-text'], tokenPalette['text-inverse']);
  assert(badgeContrast >= 4.5, `Notification badge contrast ratio is WCAG AA compliant (Ratio: ${badgeContrast.toFixed(2)}:1 >= 4.5:1)`);

  // 3. Globals.css Theme Token Coverage
  console.log('\n[Suite 3: Globals.css Tailwind v4 @theme Token Coverage]');
  const globalsPath = path.resolve(__dirname, '../../src/app/globals.css');
  const globalsContent = fs.readFileSync(globalsPath, 'utf-8');

  const requiredTokens = [
    '--color-primary',
    '--color-brand-primary',
    '--color-brand-primary-hover',
    '--color-brand-hover',
    '--color-brand-success',
    '--color-brand-error',
    '--color-background-elevated',
    '--color-text-muted',
    '--color-interactive-accent',
    '--color-status-danger',
    '--color-status-danger-bg',
    '--color-status-danger-text',
    '--color-status-danger-border',
    '--color-surface-inverse',
    '--color-text-inverse',
  ];

  for (const token of requiredTokens) {
    assert(globalsContent.includes(token), `@theme defines token ${token}`);
  }

  // 4. Notification Page (/enable-push) Implementation & Accessibility
  console.log('\n[Suite 4: Mandatory Browser Notifications Page (/enable-push) Audit]');
  const enablePushPath = path.resolve(__dirname, '../../src/app/enable-push/page.tsx');
  const enablePushContent = fs.readFileSync(enablePushPath, 'utf-8');

  assert(enablePushContent.includes("import { Button } from '@/components/ui/button'"), 'enable-push page imports shared Button component');
  assert(enablePushContent.includes('Enable Push Notifications & Enter'), 'Main action button displays exact expected label: "Enable Push Notifications & Enter"');
  assert(enablePushContent.includes('Connecting Notification Gateway...'), 'Loading state renders readable feedback label');
  assert(enablePushContent.includes('Re-check Permission'), 'Permission denied state renders readable "Re-check Permission" label');
  assert(enablePushContent.includes('Retry Registration'), 'Error state renders readable "Retry Registration" label');
  assert(enablePushContent.includes('Reload Browser'), 'Unsupported state renders readable "Reload Browser" label');
  assert(!enablePushContent.includes('text-white bg-primary'), 'enable-push does not use unmapped "text-white bg-primary" class');
  assert(enablePushContent.includes('border-surface-inverse border-t-transparent'), 'Spinner indicator uses high-contrast border-surface-inverse token');

  // 5. Codebase-wide Absence of Invisible Button Anti-Patterns
  console.log('\n[Suite 5: Project-Wide Scan Against Invisible Button Anti-Patterns]');
  const adminDashboardPath = path.resolve(__dirname, '../../src/app/admin/admin-dashboard-client.tsx');
  const adminDashboardContent = fs.readFileSync(adminDashboardPath, 'utf-8');
  assert(!adminDashboardContent.includes('bg-brand-primary text-white'), 'Admin dashboard CTA does not use undefined bg-brand-primary text-white');
  assert(adminDashboardContent.includes('bg-surface-inverse text-text-inverse'), 'Admin dashboard CTA uses canonical bg-surface-inverse text-text-inverse');

  const studentSlugPath = path.resolve(__dirname, '../../src/app/student/hackathons/[slug]/page.tsx');
  const studentSlugContent = fs.readFileSync(studentSlugPath, 'utf-8');
  assert(!studentSlugContent.includes('bg-brand-primary text-text-inverse'), 'Student hackathons slug page does not use undefined bg-brand-primary');
  assert(studentSlugContent.includes('bg-surface-inverse text-text-inverse'), 'Student hackathons slug page uses bg-surface-inverse text-text-inverse');

  const registrationProofPath = path.resolve(__dirname, '../../src/components/teams/registration-proof-card.tsx');
  const registrationProofContent = fs.readFileSync(registrationProofPath, 'utf-8');
  assert(!registrationProofContent.includes('bg-brand-primary text-text-inverse'), 'Registration proof card does not use undefined bg-brand-primary');
  assert(registrationProofContent.includes('bg-surface-inverse text-text-inverse'), 'Registration proof card uses bg-surface-inverse text-text-inverse');

  const submissionsClientPath = path.resolve(__dirname, '../../src/app/admin/hackathons/[id]/submissions/submissions-client.tsx');
  const submissionsClientContent = fs.readFileSync(submissionsClientPath, 'utf-8');
  assert(!submissionsClientContent.includes('bg-brand-primary text-white'), 'Submissions client tabs do not use bg-brand-primary text-white');
  assert(submissionsClientContent.includes('bg-surface-inverse text-text-inverse'), 'Submissions client tabs use bg-surface-inverse text-text-inverse');

  const notificationCenterPath = path.resolve(__dirname, '../../src/components/layout/notification-center.tsx');
  const notificationCenterContent = fs.readFileSync(notificationCenterPath, 'utf-8');
  assert(!notificationCenterContent.includes('text-white bg-status-error-border'), 'Notification center does not use unreadable white-on-light-pink text');
  assert(notificationCenterContent.includes('text-white bg-status-error-text'), 'Notification center uses high-contrast text-white bg-status-error-text');

  console.log(`\n=== Results: ${passed} / ${total} audit checks passed ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runButtonVisibilityTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
