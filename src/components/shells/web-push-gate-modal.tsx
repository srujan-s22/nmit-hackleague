'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface WebPushGateModalProps {
  currentPath?: string;
}

export function WebPushGateModal({ currentPath }: WebPushGateModalProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isGateLocked, setIsGateLocked] = useState(false);
  const [gateReason, setGateReason] = useState<'unsupported' | 'permission_denied' | 'not_registered' | null>(null);

  const resolvedPath = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/admin');

  useEffect(() => {
    let isMounted = true;

    async function evaluatePushSubscription() {
      // 1. Browser capability check
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        if (isMounted) {
          setIsGateLocked(true);
          setGateReason('unsupported');
          setIsChecking(false);
        }
        return;
      }

      // 2. Browser permission check
      if (Notification.permission === 'denied') {
        if (isMounted) {
          setIsGateLocked(true);
          setGateReason('permission_denied');
          setIsChecking(false);
        }
        return;
      }

      // 3. Database registration status check
      try {
        const res = await fetch('/api/push/status');
        if (res.ok) {
          const data = await res.json();
          if (data.active && Notification.permission === 'granted') {
            if (isMounted) {
              setIsGateLocked(false);
              setIsChecking(false);
            }
            return;
          }
        }
        if (isMounted) {
          setIsGateLocked(true);
          setGateReason('not_registered');
          setIsChecking(false);
        }
      } catch {
        if (isMounted) {
          setIsGateLocked(true);
          setGateReason('not_registered');
          setIsChecking(false);
        }
      }
    }

    evaluatePushSubscription();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isChecking || !isGateLocked) {
    return null;
  }

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
              Platform Policy: Dashboard access locked until push notifications are active.
            </p>
          </div>
        </div>

        {gateReason === 'unsupported' && (
          <Alert variant="error" title="Unsupported Browser Environment">
            <p className="text-xs">
              Your browser does not support the Web Push API or Service Workers. In accordance with NMIT HackLeague
              security and operational rules, administrative access cannot proceed on unsupported clients.
              Email fallback is strictly disabled. Please use a modern standard browser (Chrome, Edge, Firefox, Safari 16+).
            </p>
          </Alert>
        )}

        {gateReason === 'permission_denied' && (
          <Alert variant="warning" title="Notifications Blocked in Browser Settings">
            <p className="text-xs">
              Notification permissions have been blocked for this domain. To unlock the administrative workspace,
              please reset permission to &quot;Allow&quot; in your browser address bar and reload this page.
            </p>
          </Alert>
        )}

        {gateReason === 'not_registered' && (
          <Alert variant="info" title="Push Device Activation Required">
            <p className="text-xs">
              Institutional security controls require every administrator to have an active Web Push endpoint for
              immediate broadcast notices, escalation alerts, and session integrity verification.
            </p>
          </Alert>
        )}

        <div className="rounded-md border border-border-subtle p-3.5 bg-surface-subtle text-xs text-text-secondary space-y-1.5">
          <div className="flex items-center gap-2 text-text-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-interactive-accent" />
            <span>Zero Email Fallback Operational Invariant</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            NMIT HackLeague guarantees immediate delivery of critical round status updates and emergency revocations
            via end-to-end encrypted Web Push. Standard email notifications are not used for time-critical operational triggers.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          {gateReason === 'unsupported' ? (
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
