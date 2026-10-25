'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Root error boundary. Next.js App Router renders this for any uncaught
// render/render-time error under src/app that isn't caught by a more
// specific error.tsx closer to the route. Previously there was no error.tsx
// anywhere in the app, so an uncaught error fell through to Next.js's
// generic default error screen instead of this product's own design system.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Intentionally minimal: no sensitive data, no stack trace sent to a
    // third party here. Server Components already log their own errors;
    // this is a client-side safety net for the render path.
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-canvas p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
          <p className="text-sm text-text-secondary">
            An unexpected error occurred while loading this page. You can try again, or return to
            the dashboard if the problem continues.
          </p>
          {error.digest && (
            <p className="text-xs text-text-helper font-mono">Reference: {error.digest}</p>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => reset()}>
              Try again
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push('/')}>
              Go to dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
