'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  detectPushCapabilities,
  type PushCapabilityDetails,
} from '@/lib/notifications/push-capabilities';

interface WebPushGateModalProps {
  currentPath?: string;
}

export function WebPushGateModal({ currentPath }: WebPushGateModalProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isGateLocked, setIsGateLocked] = useState(false);
  const [capability, setCapability] = useState<PushCapabilityDetails | null>(null);
  const [gateReason, setGateReason] = useState<
    'unsupported' | 'insecure_context' | 'permission_denied' | 'not_registered' | null
  >(null);

  const resolvedPath =
    currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/admin');

  useEffect(() => {
    let isMounted = true;

    async function evaluatePushSubscription() {
      // 1. Browser capability and context detection
      const caps = detectPushCapabilities();
      if (isMounted) {
        setCapability(caps);
      }

      // Handle insecure context (e.g., LAN HTTP http://192.168.0.93:3000)
      if (caps.status === 'INSECURE_CONTEXT') {
        if (isMounted) {
          if (caps.isMobileOrTablet) {
            // Mobile/tablet in insecure LAN: do NOT lock screen; display accessible notice
            setIsGateLocked(false);
            setGateReason('insecure_context');
            setIsChecking(false);
          } else {
            // Desktop workstation: enforce secure context policy
            setIsGateLocked(true);
            setGateReason('insecure_context');
            setIsChecking(false);
          }
        }
        return;
      }

      // Handle iOS/iPadOS Safari tab requiring Home Screen PWA installation
      if (caps.status === 'IOS_STANDALONE_REQUIRED') {
        if (isMounted) {
          // Do NOT lock mobile users out of dashboard
          setIsGateLocked(false);
          setGateReason('unsupported');
          setIsChecking(false);
        }
        return;
      }

      // Handle genuinely unsupported mobile browser
      if (caps.status === 'UNSUPPORTED_MOBILE') {
        if (isMounted) {
          setIsGateLocked(false);
          setGateReason('unsupported');
          setIsChecking(false);
        }
        return;
      }

      // Handle unsupported desktop browser
      if (caps.status === 'UNSUPPORTED_DESKTOP') {
        if (isMounted) {
          setIsGateLocked(true);
          setGateReason('unsupported');
          setIsChecking(false);
        }
        return;
      }

      // 2. Notification permission check
      if (Notification.permission === 'denied') {
        if (isMounted) {
          if (caps.isMobileOrTablet) {
            // Check if mobile user acknowledged in-app mode
            const hasAckCookie = document.cookie.includes('hl_in_app_acknowledged=true');
            if (hasAckCookie) {
              setIsGateLocked(false);
              setGateReason('permission_denied');
              setIsChecking(false);
              return;
            }
          }
          setIsGateLocked(true);
          setGateReason('permission_denied');
          setIsChecking(false);
        }
        return;
      }

      // 3. Subscription status check against server
      try {
        const res = await fetch('/api/push/status');
        if (res.ok) {
          const data = await res.json();
          if (data.active && Notification.permission === 'granted') {
            if (isMounted) {
              setIsGateLocked(false);
              setGateReason(null);
              setIsChecking(false);
            }
            return;
          }
        }

        // If subscription is missing
        if (isMounted) {
          if (caps.isMobileOrTablet) {
            const hasAckCookie = document.cookie.includes('hl_in_app_acknowledged=true');
            if (hasAckCookie) {
              setIsGateLocked(false);
              setGateReason('not_registered');
              setIsChecking(false);
              return;
            }
          }
          setIsGateLocked(true);
          setGateReason('not_registered');
          setIsChecking(false);
        }
      } catch {
        if (isMounted) {
          if (caps.isMobileOrTablet) {
            setIsGateLocked(false);
            setGateReason('not_registered');
            setIsChecking(false);
          } else {
            setIsGateLocked(true);
            setGateReason('not_registered');
            setIsChecking(false);
          }
        }
      }
    }

    evaluatePushSubscription();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isChecking) {
    return null;
  }

  // Mobile / Tablet persistent status banner when push is unavailable or unconfigured
  if (capability?.isMobileOrTablet && !isGateLocked && gateReason !== null) {
    return (
      <div
        role="status"
        aria-label="Notification Channel Status"
        className="sticky top-0 z-40 bg-surface-subtle border-b border-border-subtle px-4 py-2.5 text-xs text-text-secondary flex flex-wrap items-center justify-between gap-3 shadow-xs"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-status-warning-text shrink-0 animate-pulse" />
          <div>
            {capability.status === 'INSECURE_CONTEXT' && (
              <span>
                <strong>Local LAN HTTP Context:</strong> Web Push requires HTTPS or localhost. Real-time in-app alerts and email notifications are active.
              </span>
            )}
            {capability.status === 'IOS_STANDALONE_REQUIRED' && (
              <span>
                <strong>iOS Safari Notice:</strong> Instant Web Push requires adding HackLeague to your Home Screen. In-app alerts are active in this tab.
              </span>
            )}
            {capability.status === 'UNSUPPORTED_MOBILE' && (
              <span>
                <strong>Mobile Browser Notice:</strong> Web Push is unavailable in this browser. Real-time in-app alerts and email notices are active.
              </span>
            )}
            {capability.status === 'SUPPORTED' && (
              <span>
                <strong>Push Alerts Inactive:</strong> Web Push is not configured on this device. Real-time in-app alerts are active.
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/enable-push?redirectTo=${encodeURIComponent(resolvedPath)}`}
          className="text-xs font-semibold text-text-primary underline hover:text-interactive-accent transition-colors shrink-0"
        >
          {capability.status === 'IOS_STANDALONE_REQUIRED' ? 'Install App' : 'Notification Setup'}
        </Link>
      </div>
    );
  }

  // If gate is not locked and no persistent mobile banner is needed, render nothing
  if (!isGateLocked) {
    return null;
  }

  // Locked gate modal for desktop workstations or un-acknowledged environments
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="bg-surface-canvas border border-border-interactive rounded-lg shadow-xl max-w-lg w-full p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-status-error-bg text-status-error-text flex items-center justify-center shrink-0 border border-status-error-border">
            <svg
              className="w-5 h-5 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          </div>
          <div>
            <h2 id="push-gate-title" className="text-base font-bold text-text-primary">
              Mandatory Web Push Notification Gate
            </h2>
            <p className="text-xs text-text-secondary">
              Platform Policy: Desktop workstation access locked until push notifications are active.
            </p>
          </div>
        </div>

        {gateReason === 'insecure_context' && (
          <Alert variant="error" title="Secure Context Required">
            <p className="text-xs">
              Web Push requires a Secure Context (HTTPS or localhost). Your browser is accessing HackLeague
              over unencrypted LAN HTTP. Please access HackLeague via{' '}
              <code className="font-mono bg-surface-subtle px-1 py-0.5 rounded">http://localhost:3000</code> or
              configure an HTTPS certificate.
            </p>
          </Alert>
        )}

        {gateReason === 'unsupported' && (
          <Alert variant="error" title="Unsupported Desktop Environment">
            <p className="text-xs">
              Your browser does not support the Web Push API or Service Workers. In accordance with NMIT HackLeague
              security and operational rules, desktop access cannot proceed on unsupported clients.
              Please use a modern standard browser (Chrome, Edge, Firefox, or Safari 16.4+).
            </p>
          </Alert>
        )}

        {gateReason === 'permission_denied' && (
          <Alert variant="warning" title="Notifications Blocked in Browser Settings">
            <p className="text-xs">
              Notification permissions have been blocked for this domain. To unlock the workspace,
              please reset permission to &quot;Allow&quot; in your browser address bar and reload this page.
            </p>
          </Alert>
        )}

        {gateReason === 'not_registered' && (
          <Alert variant="info" title="Push Device Activation Required">
            <p className="text-xs">
              Institutional security controls require an active Web Push endpoint for
              immediate broadcast notices, escalation alerts, and session integrity verification.
            </p>
          </Alert>
        )}

        <div className="rounded-md border border-border-subtle p-3.5 bg-surface-subtle text-xs text-text-secondary space-y-1.5">
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-interactive-accent" />
            <span>Capability-Gated Notification Invariant</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            HackLeague guarantees immediate delivery of critical round status updates and emergency revocations
            via end-to-end encrypted Web Push on desktop workstations.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          {gateReason === 'insecure_context' ? (
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto text-xs"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  const localUrl = new URL(window.location.href);
                  localUrl.hostname = 'localhost';
                  window.location.href = localUrl.toString();
                }
              }}
            >
              Switch to localhost:3000
            </Button>
          ) : gateReason === 'unsupported' ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto text-xs"
              onClick={() => window.location.reload()}
            >
              Retry Browser Detection
            </Button>
          ) : (
            <Link
              href={`/enable-push?redirectTo=${encodeURIComponent(resolvedPath)}`}
              className="w-full sm:w-auto"
            >
              <Button type="button" variant="primary" className="w-full text-xs">
                Activate Web Push Notifications
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
