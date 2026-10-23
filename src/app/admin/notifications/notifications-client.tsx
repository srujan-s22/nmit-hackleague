'use client';

import React, { useState } from 'react';
import { publishAnnouncementAction, getNotificationDeliveryStatsAction } from '@/actions/notification-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatNotificationTimestamp } from '@/lib/notifications/format-timestamp';

interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  target_role: string;
  hackathon_id?: string | null;
  announcement_type?: string;
  created_at: string;
}

interface HackathonOption {
  id: string;
  title: string;
}

interface DeliveryStats {
  delivered: number;
  failed: number;
  expired: number;
  pending: number;
  totalAttempts: number;
}

interface NotificationsClientProps {
  initialAnnouncements: AnnouncementItem[];
  hackathons?: HackathonOption[];
  initialStats?: DeliveryStats;
  announcementsError?: string | null;
  statsError?: string | null;
}

export function NotificationsClient({
  initialAnnouncements,
  hackathons = [],
  initialStats = { delivered: 0, failed: 0, expired: 0, pending: 0, totalAttempts: 0 },
  announcementsError = null,
  statsError = null,
}: NotificationsClientProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(initialAnnouncements);
  const [stats, setStats] = useState<DeliveryStats>(initialStats);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<'all' | 'students' | 'admins'>('all');
  const [hackathonId, setHackathonId] = useState<string>('');
  const [announcementType, setAnnouncementType] = useState<'general' | 'deadline' | 'system' | 'urgent'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setStatusMessage({ type: 'error', text: 'Please provide both a title and message body.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await publishAnnouncementAction(
      title,
      message,
      targetRole,
      hackathonId || undefined,
      announcementType
    );

    if (!res.success) {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to dispatch broadcast.' });
      setIsSubmitting(false);
      return;
    }

    setStatusMessage({
      type: 'success',
      text: `Broadcast published! ${res.subscribersTargeted ? `Dispatched Web Push to ${res.subscribersTargeted} active subscriber(s).` : 'In-app alert published.'}`,
    });

    setAnnouncements((prev) => [
      {
        id: res.announcementId || crypto.randomUUID(),
        title: title.trim(),
        message: message.trim(),
        target_role: targetRole,
        hackathon_id: hackathonId || null,
        announcement_type: announcementType,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);

    try {
      const latestStats = await getNotificationDeliveryStatsAction();
      if (latestStats.success && latestStats.stats) {
        setStats(latestStats.stats);
      } else if (res.subscribersTargeted && res.subscribersTargeted > 0) {
        setStats((prev) => ({
          ...prev,
          delivered: prev.delivered + res.subscribersTargeted!,
          totalAttempts: prev.totalAttempts + res.subscribersTargeted!,
        }));
      }
    } catch {
      if (res.subscribersTargeted && res.subscribersTargeted > 0) {
        setStats((prev) => ({
          ...prev,
          delivered: prev.delivered + res.subscribersTargeted!,
          totalAttempts: prev.totalAttempts + res.subscribersTargeted!,
        }));
      }
    }

    setTitle('');
    setMessage('');
    setTargetRole('all');
    setHackathonId('');
    setAnnouncementType('general');
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Reliability & Push Delivery Health Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface-canvas border border-border-subtle rounded-xl p-4 shadow-xs">
          <p className="text-xs font-medium text-text-secondary">Delivered Pushes</p>
          <p className="text-2xl font-bold text-status-success-border mt-1">{stats.delivered}</p>
          <span className="text-[11px] text-text-helper">Confirmed 201 Created</span>
        </div>

        <div className="bg-surface-canvas border border-border-subtle rounded-xl p-4 shadow-xs">
          <p className="text-xs font-medium text-text-secondary">Expired Subscriptions</p>
          <p className="text-2xl font-bold text-status-warning-border mt-1">{stats.expired}</p>
          <span className="text-[11px] text-text-helper">Deactivated 410 Gone</span>
        </div>

        <div className="bg-surface-canvas border border-border-subtle rounded-xl p-4 shadow-xs">
          <p className="text-xs font-medium text-text-secondary">Failed Dispatches</p>
          <p className="text-2xl font-bold text-status-error-border mt-1">{stats.failed}</p>
          <span className="text-[11px] text-text-helper">Exhausted Retries</span>
        </div>

        <div className="bg-surface-canvas border border-border-subtle rounded-xl p-4 shadow-xs">
          <p className="text-xs font-medium text-text-secondary">Total Push Events</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{stats.totalAttempts}</p>
          <span className="text-[11px] text-text-helper">Audited in PostgreSQL</span>
        </div>
      </div>

      {statsError && (
        <Alert variant="warning" title="Delivery Statistics Notice">
          Push delivery metrics could not be fully aggregated from PostgreSQL: {statsError}
        </Alert>
      )}

      {statusMessage && (
        <Alert
          variant={statusMessage.type === 'error' ? 'error' : 'success'}
          title={statusMessage.type === 'error' ? 'Error' : 'Success'}
        >
          {statusMessage.text}
        </Alert>
      )}

      {/* Broadcast Creation Form */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-5">
        <div className="border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold text-text-primary">Dispatch Broadcast Announcement</h2>
          <p className="text-xs text-text-secondary mt-1">
            Broadcasts appear immediately in the top navigation bell for eligible users and dispatch browser Web Push notifications to active subscribers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="announcement-title" className="block text-xs font-medium text-text-secondary mb-1">
                Announcement Title <span className="text-status-error-border">*</span>
              </label>
              <input
                id="announcement-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Round 1 Problem Statements Released"
                maxLength={120}
                required
                className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </div>

            <div>
              <label htmlFor="announcement-type" className="block text-xs font-medium text-text-secondary mb-1">
                Announcement Category
              </label>
              <select
                id="announcement-type"
                value={announcementType}
                onChange={(e) => setAnnouncementType(e.target.value as 'general' | 'deadline' | 'system' | 'urgent')}
                className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <option value="general">General Broadcast</option>
                <option value="deadline">Deadline Reminder</option>
                <option value="urgent">Urgent / Emergency Alert</option>
                <option value="system">System Maintenance</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="announcement-audience" className="block text-xs font-medium text-text-secondary mb-1">
                Target Role
              </label>
              <select
                id="announcement-audience"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as 'all' | 'students' | 'admins')}
                className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <option value="all">Everyone (Students & Admins)</option>
                <option value="students">Students Only</option>
                <option value="admins">Administrators Only</option>
              </select>
            </div>

            <div>
              <label htmlFor="announcement-hackathon" className="block text-xs font-medium text-text-secondary mb-1">
                Event Scope (Optional)
              </label>
              <select
                id="announcement-hackathon"
                value={hackathonId}
                onChange={(e) => setHackathonId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <option value="">Global (Platform-Wide)</option>
                {hackathons.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="announcement-body" className="block text-xs font-medium text-text-secondary mb-1">
              Message Body <span className="text-status-error-border">*</span>
            </label>
            <textarea
              id="announcement-body"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Provide clear details, deadlines, and instructions..."
              maxLength={1000}
              required
              className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
            <div className="text-right text-[11px] text-text-helper mt-1">
              {message.length} / 1000 characters
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              {isSubmitting ? 'Dispatching Broadcast...' : 'Dispatch Announcement'}
            </Button>
          </div>
        </form>
      </div>

      {/* Broadcast History */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Broadcast History</h2>

        {announcementsError ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-xs text-status-error-border font-medium">
              Unable to retrieve broadcast history: {announcementsError}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              Retry
            </Button>
          </div>
        ) : announcements.length === 0 ? (
          <p className="text-xs text-text-helper py-4 text-center">No broadcast announcements published yet.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {announcements.map((ann) => (
              <div key={ann.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">{ann.title}</h3>
                    {ann.announcement_type && ann.announcement_type !== 'general' && (
                      <Badge variant={ann.announcement_type === 'urgent' ? 'error' : 'warning'}>
                        {ann.announcement_type.toUpperCase()}
                      </Badge>
                    )}
                    {ann.hackathon_id && (
                      <Badge variant="neutral">SCOPED EVENT</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ann.target_role === 'all' ? 'info' : 'neutral'}>
                      {ann.target_role.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] text-text-helper">
                      {formatNotificationTimestamp(ann.created_at)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{ann.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
