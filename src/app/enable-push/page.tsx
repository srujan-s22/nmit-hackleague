'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import {
  detectPushCapabilities,
  isSameApplicationServerKey,
  urlBase64ToUint8Array,
  type PushCapabilityDetails,
} from '@/lib/notifications/push-capabilities';

type PushGateState =
  | 'CHECKING'
  | 'INSECURE_CONTEXT'
  | 'IOS_STANDALONE_REQUIRED'
  | 'UNSUPPORTED_MOBILE'
  | 'UNSUPPORTED_DESKTOP'
  | 'PERMISSION_DENIED'
  | 'SUPPORTED_READY'
  | 'REGISTERING'
  | 'ENABLED'
  | 'ERROR';

function EnablePushContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/student';

  const [gateState, setGateState] = useState<PushGateState>('CHECKING');
  const [capability, setCapability] = useState<PushCapabilityDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAcknowledging, setIsAcknowledging] = useState<boolean>(false);

  const checkInitialState = useCallback(async () => {
    setGateState('CHECKING');
    setErrorMessage('');

    // 1. Capability & context detection (feature tests, secure origin, iOS standalone)
    const caps = detectPushCapabilities();
    setCapability(caps);

    if (caps.status === 'INSECURE_CONTEXT') {
      setGateState('INSECURE_CONTEXT');
      return;
    }

    if (caps.status === 'IOS_STANDALONE_REQUIRED') {
      setGateState('IOS_STANDALONE_REQUIRED');
      return;
    }

    if (caps.status === 'UNSUPPORTED_MOBILE') {
      setGateState('UNSUPPORTED_MOBILE');
      return;
    }

    if (caps.status === 'UNSUPPORTED_DESKTOP') {
      setGateState('UNSUPPORTED_DESKTOP');
      return;
    }

    // 2. Browser notification permission check
    if (Notification.permission === 'denied') {
      setGateState('PERMISSION_DENIED');
      return;
    }

    // 3. Inspect existing subscription & VAPID key alignment
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;

      let authoritativeVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
      if (!authoritativeVapidKey) {
        const keyRes = await fetch('/api/push/vapid-public-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          authoritativeVapidKey = keyData.publicKey || '';
        }
      }

      const keyMatches =
        sub && authoritativeVapidKey
          ? isSameApplicationServerKey(sub.options?.applicationServerKey, authoritativeVapidKey)
          : false;

      // Only consider push enabled if local browser has an active subscription bound to current VAPID key
      if (sub && keyMatches && Notification.permission === 'granted') {
        const res = await fetch('/api/push/status');
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setGateState('ENABLED');
            setTimeout(() => {
              router.push(redirectTo);
            }, 800);
            return;
          }
        }
      }
    } catch {
      // Fall through to supported ready state
    }

    setGateState('SUPPORTED_READY');
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

  // A browser prompt that is never answered (or a service worker that never activates)
  // must not leave the user on an endless spinner.
  function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  async function handleEnablePush() {
    setGateState('REGISTERING');
    setErrorMessage('');

    try {
      // 1. Request native browser notification permission
      const permission = await withTimeout(
        Notification.requestPermission(),
        30000,
        'No response to the notification prompt. Click the icon at the left of the address bar, allow notifications for this site, then try again.'
      );
      if (permission !== 'granted') {
        setGateState('PERMISSION_DENIED');
        return;
      }

      // 2. Register Web Push Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await withTimeout(
        navigator.serviceWorker.ready,
        20000,
        'The notification service did not start. Reload the page and try again.'
      );

      // 3. Retrieve authoritative VAPID public key
      let vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
      if (!vapidKey) {
        try {
          const keyRes = await fetch('/api/push/vapid-public-key');
          if (keyRes.ok) {
            const keyData = await keyRes.json();
            vapidKey = keyData.publicKey || '';
          }
        } catch {
          // Fall through
        }
      }

      if (!vapidKey) {
        throw new Error('Push gateway public key unavailable. Please contact an administrator.');
      }

      // 4. Verify existing subscription against current VAPID key
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const matchesCurrentKey = isSameApplicationServerKey(
          subscription.options?.applicationServerKey,
          vapidKey
        );
        if (!matchesCurrentKey) {
          // Unsubscribe stale or mismatched subscription
          await subscription.unsubscribe();
          subscription = null;
        }
      }

      // 5. Subscribe freshly if needed
      if (!subscription) {
        const appServerKey = urlBase64ToUint8Array(vapidKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as unknown as BufferSource,
        });
      }

      // 6. Derive endpoint and cryptographic keys
      const endpoint = subscription.endpoint;
      const rawP256dh = subscription.getKey('p256dh');
      const rawAuth = subscription.getKey('auth');

      if (!rawP256dh || !rawAuth) {
        throw new Error('Push subscription keys unavailable from browser push manager.');
      }

      const p256dh = btoa(String.fromCharCode(...new Uint8Array(rawP256dh)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)));

      // 7. Register device subscription in backend database
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
      setErrorMessage(
        err instanceof Error ? err.message : 'Push registration encountered an unexpected error.'
      );
    }
  }

  async function handleContinueInApp() {
    setIsAcknowledging(true);
    try {
      const res = await fetch('/api/push/acknowledge-in-app', { method: 'POST' });
      if (res.ok) {
        router.push(redirectTo);
      } else {
        router.push(redirectTo);
      }
    } catch {
      router.push(redirectTo);
    } finally {
      setIsAcknowledging(false);
    }
  }

  const isMobile = Boolean(capability?.isMobileOrTablet);

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

      {/* Main Push Gate Card */}
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-lg bg-surface-canvas rounded-lg border border-border-subtle p-6 sm:p-8 shadow-card text-center">
          {/* Status Indicator Icon */}
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-surface-subtle mb-6 border border-border-subtle">
            {gateState === 'CHECKING' && (
              <span className="inline-block animate-spin h-7 w-7 border-2 border-surface-inverse border-t-transparent rounded-full" />
            )}
            {gateState === 'INSECURE_CONTEXT' && (
              <span className="text-2xl" role="img" aria-label="Insecure Context">
                🔒
              </span>
            )}
            {gateState === 'IOS_STANDALONE_REQUIRED' && (
              <span className="text-2xl" role="img" aria-label="Add to Home Screen">
                📱
              </span>
            )}
            {gateState === 'UNSUPPORTED_MOBILE' && (
              <span className="text-2xl text-status-warning-text" role="img" aria-label="Unsupported Mobile">
                🔔
              </span>
            )}
            {gateState === 'UNSUPPORTED_DESKTOP' && (
              <span className="text-2xl text-status-danger-text" role="img" aria-label="Unsupported Desktop">
                ⚠️
              </span>
            )}
            {gateState === 'PERMISSION_DENIED' && (
              <span className="text-2xl text-status-danger-text" role="img" aria-label="Denied">
                🚫
              </span>
            )}
            {gateState === 'SUPPORTED_READY' && (
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

          {/* Heading */}
          <h1 className="text-xl font-semibold text-text-primary mb-3">
            {gateState === 'CHECKING' && 'Checking Device & Push Support...'}
            {gateState === 'INSECURE_CONTEXT' &&
              (isMobile ? 'Local LAN Development Context' : 'Insecure Origin: Localhost or HTTPS Required')}
            {gateState === 'IOS_STANDALONE_REQUIRED' && 'Add HackLeague to Your Home Screen'}
            {gateState === 'UNSUPPORTED_MOBILE' && 'Mobile Web Push Unavailable'}
            {gateState === 'UNSUPPORTED_DESKTOP' && 'Desktop Browser Push Unsupported'}
            {gateState === 'PERMISSION_DENIED' && 'Notification Permission Blocked'}
            {gateState === 'SUPPORTED_READY' && 'Enable Instant Notifications'}
            {gateState === 'REGISTERING' && 'Connecting Push Gateway...'}
            {gateState === 'ENABLED' && 'Notifications Successfully Active!'}
            {gateState === 'ERROR' && 'Unable to Register Push Subscription'}
          </h1>

          {/* Body Content */}
          <div className="text-sm text-text-secondary leading-relaxed mb-6 space-y-3">
            {gateState === 'CHECKING' && (
              <p>Analyzing browser capabilities, secure context invariants, and subscription state...</p>
            )}

            {/* INSECURE CONTEXT (e.g. LAN IP 192.168.0.93:3000) */}
            {gateState === 'INSECURE_CONTEXT' && (
              <div className="space-y-3 text-left">
                <div className="bg-surface-subtle p-3.5 rounded-md border border-border-subtle text-xs space-y-2">
                  <p className="font-semibold text-text-primary">
                    W3C Secure Context Constraint:
                  </p>
                  <p>
                    Your browser is accessing HackLeague over unencrypted HTTP (
                    <code className="text-status-warning-text font-mono">
                      {typeof window !== 'undefined' ? window.location.origin : 'http://192.168.x.x:3000'}
                    </code>
                    ). Modern browsers strictly disable Service Workers and the Web Push API on unencrypted
                    network addresses.
                  </p>
                </div>

                {isMobile ? (
                  <>
                    <p className="text-xs">
                      Because you are connected via a mobile device or tablet on the local network, you can
                      proceed directly using real-time <strong>In-App Notifications</strong> and emergency emails.
                    </p>
                    {process.env.NODE_ENV !== 'production' && (
                    <div className="bg-status-info-bg/50 border border-status-info-border/60 p-2.5 rounded text-[11px] text-text-secondary">
                      <strong>Developer note:</strong> To test native Web Push on physical phones, run the dev
                      server with local HTTPS (<code className="font-mono">npm run dev:https</code>) or access via a secure tunnel.
                    </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-status-danger-text font-medium">
                      Desktop workstations must access HackLeague via a Secure Context to enable mandatory push alerts.
                    </p>
                    <p className="text-xs">
                      Please access HackLeague locally via{' '}
                      <code className="font-mono bg-surface-subtle px-1 py-0.5 rounded">http://localhost:3000</code> or
                      configure an HTTPS certificate.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* IOS STANDALONE REQUIRED (iOS Safari tab requires Add to Home Screen) */}
            {gateState === 'IOS_STANDALONE_REQUIRED' && (
              <div className="space-y-3 text-left">
                <p className="text-xs">
                  On Apple iOS and iPadOS (version 16.4+), Web Push notifications are only supported when
                  the application is installed as a Progressive Web App on your Home Screen.
                </p>

                <div className="bg-surface-subtle p-3.5 rounded-md border border-border-subtle text-xs space-y-2">
                  <p className="font-semibold text-text-primary">How to install on iPhone/iPad:</p>
                  <ol className="list-decimal pl-4 space-y-1.5 text-text-secondary">
                    <li>
                      Tap the <strong>Share</strong> button in Safari (the square with an arrow pointing up at the bottom).
                    </li>
                    <li>
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </li>
                    <li>
                      Tap <strong>Add</strong> in the top-right corner.
                    </li>
                    <li>
                      Open the <strong>HackLeague</strong> app from your Home Screen to activate push notifications.
                    </li>
                  </ol>
                </div>

                <p className="text-[11px] text-text-muted">
                  Alternatively, you can continue directly in Safari using real-time In-App Notifications.
                </p>
              </div>
            )}

            {/* UNSUPPORTED MOBILE */}
            {gateState === 'UNSUPPORTED_MOBILE' && (
              <div className="space-y-2 text-left">
                <p className="text-xs">
                  Your current mobile browser does not support the Web Push API. HackLeague will keep you
                  updated through real-time in-app announcements and urgent email notifications.
                </p>
                <div className="p-3 bg-surface-subtle rounded border border-border-subtle text-[11px] text-text-muted">
                  ✓ In-app notification center is active.
                  <br />
                  ✓ Broadcast announcements and read receipts remain functional.
                </div>
              </div>
            )}

            {/* UNSUPPORTED DESKTOP */}
            {gateState === 'UNSUPPORTED_DESKTOP' && (
              <div className="space-y-2 text-left">
                <p className="text-status-danger-text text-xs font-medium">
                  Your desktop browser does not support Service Workers or Web Push.
                </p>
                <p className="text-xs">
                  Notifications are required on desktop so you never miss round changes or review results. Please open HackLeague in a modern
                  browser: Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari 16.4+.
                </p>
              </div>
            )}

            {/* PERMISSION DENIED */}
            {gateState === 'PERMISSION_DENIED' && (
              <div className="space-y-3 text-left">
                <p className="text-status-danger-text text-xs font-medium">
                  Notification permission was blocked in your browser settings.
                </p>
                <div className="bg-surface-subtle p-3 rounded text-xs space-y-1 font-mono text-text-secondary">
                  <p>1. Tap or click the site settings / lock icon in your address bar.</p>
                  <p>2. Set &quot;Notifications&quot; to &quot;Allow&quot;.</p>
                  <p>3. Tap &quot;Re-check Permission&quot; below.</p>
                </div>
                {isMobile && (
                  <p className="text-[11px] text-text-muted">
                    If you cannot enable notifications on your phone, you may proceed with in-app alerts.
                  </p>
                )}
              </div>
            )}

            {/* SUPPORTED READY */}
            {gateState === 'SUPPORTED_READY' && (
              <>
                <p>
                  Get notified about rounds, review results and schedule changes, even when HackLeague is not open.
                </p>
                <p className="text-xs text-text-muted">
                  Your browser will ask for permission.
                </p>
              </>
            )}

            {gateState === 'REGISTERING' && (
              <p>Registering your device with the end-to-end encrypted notification gateway...</p>
            )}

            {gateState === 'ENABLED' && (
              <p className="text-status-success-text font-medium">
                Push endpoint verified and active. Redirecting to your workspace...
              </p>
            )}

            {gateState === 'ERROR' && (
              <div className="text-left bg-status-danger-bg p-3 rounded border border-status-danger-border text-xs text-status-danger-text">
                <p className="font-semibold mb-1">Registration Error:</p>
                <p>{errorMessage}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* SUPPORTED READY ACTIONS */}
            {gateState === 'SUPPORTED_READY' && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleEnablePush}
                >
                  Enable Push Notifications & Enter
                </Button>
                {isMobile && (
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    fullWidth
                    isLoading={isAcknowledging}
                    onClick={handleContinueInApp}
                    className="text-xs text-text-secondary"
                  >
                    Continue with In-App Notifications Only
                  </Button>
                )}
              </>
            )}

            {/* INSECURE CONTEXT ACTIONS */}
            {gateState === 'INSECURE_CONTEXT' && (
              <>
                {isMobile ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    fullWidth
                    isLoading={isAcknowledging}
                    onClick={handleContinueInApp}
                  >
                    Continue to Dashboard (In-App Notifications)
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const localUrl = new URL(window.location.href);
                        localUrl.hostname = 'localhost';
                        window.location.href = localUrl.toString();
                      }
                    }}
                  >
                    Switch to http://localhost:3000
                  </Button>
                )}
              </>
            )}

            {/* IOS STANDALONE REQUIRED ACTIONS */}
            {gateState === 'IOS_STANDALONE_REQUIRED' && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={isAcknowledging}
                  onClick={handleContinueInApp}
                >
                  Continue in Safari (In-App Notifications Only)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={checkInitialState}
                >
                  Re-check Capabilities
                </Button>
              </>
            )}

            {/* UNSUPPORTED MOBILE ACTIONS */}
            {gateState === 'UNSUPPORTED_MOBILE' && (
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                isLoading={isAcknowledging}
                onClick={handleContinueInApp}
              >
                Continue to Dashboard (In-App Notifications)
              </Button>
            )}

            {/* UNSUPPORTED DESKTOP ACTIONS */}
            {gateState === 'UNSUPPORTED_DESKTOP' && (
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

            {/* REGISTERING STATE ACTION */}
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

            {/* PERMISSION DENIED ACTIONS */}
            {gateState === 'PERMISSION_DENIED' && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={checkInitialState}
                >
                  Re-check Permission
                </Button>
                {isMobile && (
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    fullWidth
                    isLoading={isAcknowledging}
                    onClick={handleContinueInApp}
                    className="text-xs text-text-secondary"
                  >
                    Continue with In-App Notifications
                  </Button>
                )}
              </>
            )}

            {/* ERROR ACTIONS */}
            {gateState === 'ERROR' && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleEnablePush}
                >
                  Retry Registration
                </Button>
                {isMobile && (
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    fullWidth
                    isLoading={isAcknowledging}
                    onClick={handleContinueInApp}
                    className="text-xs text-text-secondary"
                  >
                    Continue with In-App Notifications
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-text-muted mt-8">
        &copy; {new Date().getFullYear()} NMIT HackLeague. Capability-gated notification security policy.
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
