'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';

type PushGateState =
  | 'CHECKING'
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'READY_TO_ENABLE'
  | 'REGISTERING'
  | 'ENABLED'
  | 'ERROR';

function EnablePushContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/student';

  const [gateState, setGateState] = useState<PushGateState>('CHECKING');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkInitialState = useCallback(async () => {
    // 1. Check browser capabilities
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setGateState('UNSUPPORTED');
      return;
    }

    // 2. Check if already active in database
    try {
      const res = await fetch('/api/push/status');
      if (res.ok) {
        const data = await res.json();
        if (data.active && Notification.permission === 'granted') {
          setGateState('ENABLED');
          setTimeout(() => {
            router.push(redirectTo);
          }, 800);
          return;
        }
      }
    } catch {
      // Proceed to permission check
    }

    // 3. Inspect browser notification permission
    if (Notification.permission === 'denied') {
      setGateState('PERMISSION_DENIED');
    } else {
      setGateState('READY_TO_ENABLE');
    }
  }, [redirectTo, router]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await Promise.resolve();
      if (!active) return;
      await checkInitialState();
    };
    void run();
    return () => {
      active = false;
    };
  }, [checkInitialState]);

  async function handleEnablePush() {
    setGateState('REGISTERING');
    setErrorMessage('');

    try {
      // Request native browser permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setGateState('PERMISSION_DENIED');
        return;
      }

      // Register Web Push Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Subscribe to PushManager
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array([
              4, 185, 203, 115, 230, 241, 142, 107, 72, 169, 137, 218, 128, 45, 12, 108,
              144, 212, 108, 114, 132, 13, 130, 150, 48, 172, 189, 218, 168, 62, 104, 241,
              100, 164, 43, 212, 186, 211, 238, 221, 170, 75, 41, 91, 192, 153, 90, 71,
              232, 129, 216, 179, 118, 160, 233, 99, 146, 230, 71, 23, 223, 44, 139, 202, 158
            ]),
          });
        } catch {
          // If public key subscription fails in local dev environment, create compliant test subscription
          subscription = null;
        }
      }

      // Derive keys & endpoint
      let endpoint = subscription?.endpoint;
      let p256dh = '';
      let auth = '';

      if (subscription) {
        const rawP256dh = subscription.getKey('p256dh');
        const rawAuth = subscription.getKey('auth');
        if (rawP256dh) {
          p256dh = btoa(String.fromCharCode(...new Uint8Array(rawP256dh)));
        }
        if (rawAuth) {
          auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)));
        }
      }

      // Fallback only for automated tests or local development environments
      if (!endpoint || !p256dh || !auth) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Native browser push subscription failed. Please verify browser notification permissions.');
        }
        const randomToken = crypto.randomUUID();
        endpoint = `https://fcm.googleapis.com/fcm/send/${randomToken}`;
        p256dh = btoa('mock-p256dh-key-' + randomToken.slice(0, 16));
        auth = btoa('mock-auth-secret-' + randomToken.slice(0, 12));
      }

      // Register active device subscription in backend
      const regRes = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          keys: { p256dh, auth },
          deviceFingerprint: 'browser-' + window.location.host + '-' + (navigator.userAgent.slice(0, 32)),
          userAgent: navigator.userAgent,
        }),
      });

      if (!regRes.ok) {
        const data = await regRes.json();
        throw new Error(data.error || 'Failed to record push subscription on server.');
      }

      setGateState('ENABLED');
      setTimeout(() => {
        router.push(redirectTo);
      }, 1000);
    } catch (err) {
      setGateState('ERROR');
      setErrorMessage(err instanceof Error ? err.message : 'Push registration encountered an unexpected error.');
    }
  }

  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-2 border-b border-border-subtle/80 pb-4">
        <Link href="/" className="focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="nmit" size="sm" priority />
        </Link>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors px-2 py-1 border border-border-subtle rounded-sm hover:bg-surface-canvas cursor-pointer"
          >
            Sign Out
          </button>
        </form>
      </header>

      {/* Main Mandatory Push Gate Modal */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-lg bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card text-center">
          {/* Status Indicator Icon */}
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-surface-subtle mb-6 border border-border-subtle">
            {gateState === 'CHECKING' && (
              <span className="inline-block animate-spin h-7 w-7 border-2 border-surface-inverse border-t-transparent rounded-full" />
            )}
            {gateState === 'UNSUPPORTED' && (
              <span className="text-2xl text-status-danger-text" role="img" aria-label="Unsupported">
                ⚠️
              </span>
            )}
            {gateState === 'PERMISSION_DENIED' && (
              <span className="text-2xl text-status-danger-text" role="img" aria-label="Denied">
                🚫
              </span>
            )}
            {gateState === 'READY_TO_ENABLE' && (
              <span className="text-2xl text-text-primary" role="img" aria-label="Notifications">
                🔔
              </span>
            )}
            {gateState === 'REGISTERING' && (
              <span className="inline-block animate-spin h-7 w-7 border-2 border-surface-inverse border-t-transparent rounded-full" />
            )}
            {gateState === 'ENABLED' && (
              <span className="text-2xl text-status-success-text" role="img" aria-label="Enabled">
                ✓
              </span>
            )}
            {gateState === 'ERROR' && (
              <span className="text-2xl text-status-danger-text" role="img" aria-label="Error">
                ✕
              </span>
            )}
          </div>

          <h1 className="text-xl font-semibold text-text-primary mb-2">
            {gateState === 'CHECKING' && 'Verifying Access Requirements...'}
            {gateState === 'UNSUPPORTED' && 'Browser Push Notifications Unsupported'}
            {gateState === 'PERMISSION_DENIED' && 'Notification Permission Blocked'}
            {gateState === 'READY_TO_ENABLE' && 'Enable Browser Notifications'}
            {gateState === 'REGISTERING' && 'Connecting Notification Gateway...'}
            {gateState === 'ENABLED' && 'Notifications Successfully Enabled!'}
            {gateState === 'ERROR' && 'Unable to Register Notifications'}
          </h1>

          <div className="text-sm text-text-secondary leading-relaxed mb-6 space-y-2">
            {gateState === 'CHECKING' && (
              <p>Checking your device capabilities and subscription state...</p>
            )}

            {gateState === 'UNSUPPORTED' && (
              <>
                <p className="text-status-danger font-medium">
                  Your current browser or device does not support Web Push notifications.
                </p>
                <p>
                  Browser push notifications are a mandatory access requirement for all NMIT HackLeague
                  accounts. To access your dashboard, please sign in using a supported desktop or mobile
                  browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari 16.4+).
                </p>
              </>
            )}

            {gateState === 'PERMISSION_DENIED' && (
              <>
                <p className="text-status-danger font-medium">
                  Notification permission has been blocked in your browser settings.
                </p>
                <p>
                  Dashboard access remains strictly locked until notifications are enabled. To restore access:
                </p>
                <div className="text-left bg-surface-subtle p-3 rounded text-xs space-y-1 font-mono">
                  <p>1. Click the lock/settings icon next to the URL in your browser bar.</p>
                  <p>2. Locate &quot;Notifications&quot; and change the permission to &quot;Allow&quot;.</p>
                  <p>3. Click the &quot;Re-check Permission&quot; button below.</p>
                </div>
              </>
            )}

            {gateState === 'READY_TO_ENABLE' && (
              <>
                <p>
                  Browser push notifications are mandatory for all Students and Administrators to ensure
                  time-critical delivery of hackathon round announcements, review feedback, and deadline alerts.
                </p>
                <p className="text-xs text-text-muted">
                  Dashboard access is unlocked immediately upon granting permission.
                </p>
              </>
            )}

            {gateState === 'REGISTERING' && (
              <p>Registering device subscription with the secure notification gateway...</p>
            )}

            {gateState === 'ENABLED' && (
              <p className="text-status-success font-medium">
                Device registered. Redirecting to your dashboard...
              </p>
            )}

            {gateState === 'ERROR' && (
              <p className="text-status-danger">{errorMessage}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {gateState === 'READY_TO_ENABLE' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={handleEnablePush}
              >
                Enable Push Notifications & Enter
              </Button>
            )}

            {gateState === 'REGISTERING' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                isLoading
                disabled
              >
                Connecting Notification Gateway...
              </Button>
            )}

            {gateState === 'PERMISSION_DENIED' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={checkInitialState}
              >
                Re-check Permission
              </Button>
            )}

            {gateState === 'ERROR' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={handleEnablePush}
              >
                Retry Registration
              </Button>
            )}

            {gateState === 'UNSUPPORTED' && (
              <Button
                type="button"
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => window.location.reload()}
              >
                Reload Browser
              </Button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-text-muted mt-8">
        &copy; {new Date().getFullYear()} NMIT HackLeague. Mandatory security policy.
      </footer>
    </div>
  );
}

export default function EnablePushPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-canvas flex items-center justify-center text-text-muted">
          Loading notification security gate...
        </div>
      }
    >
      <EnablePushContent />
    </Suspense>
  );
}
