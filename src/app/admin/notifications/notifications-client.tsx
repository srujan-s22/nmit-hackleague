'use client';

import React, { useState } from 'react';
import { publishAnnouncementAction } from '@/actions/notification-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  target_role: string;
  created_at: string;
}

interface NotificationsClientProps {
  initialAnnouncements: AnnouncementItem[];
}

export function NotificationsClient({ initialAnnouncements }: NotificationsClientProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(initialAnnouncements);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<'all' | 'students' | 'admins'>('all');
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

    const res = await publishAnnouncementAction(title, message, targetRole);

    if (!res.success) {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to dispatch broadcast.' });
      setIsSubmitting(false);
      return;
    }

    setStatusMessage({
      type: 'success',
      text: 'Broadcast announcement successfully published and dispatched via Web Push!',
    });

    setAnnouncements((prev) => [
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        message: message.trim(),
        target_role: targetRole,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);

    setTitle('');
    setMessage('');
    setTargetRole('all');
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-8 max-w-4xl">
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
            <label htmlFor="announcement-audience" className="block text-xs font-medium text-text-secondary mb-1">
              Target Audience
            </label>
            <select
              id="announcement-audience"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as 'all' | 'students' | 'admins')}
              className="w-full sm:w-64 px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            >
              <option value="all">Everyone (Students & Admins)</option>
              <option value="students">Students Only</option>
              <option value="admins">Administrators Only</option>
            </select>
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
              {isSubmitting ? 'Dispatching...' : 'Dispatch Announcement'}
            </Button>
          </div>
        </form>
      </div>

      {/* Broadcast History */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Broadcast History</h2>

        {announcements.length === 0 ? (
          <p className="text-xs text-text-helper py-4 text-center">No broadcast announcements published yet.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {announcements.map((ann) => (
              <div key={ann.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{ann.title}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant={ann.target_role === 'all' ? 'info' : 'neutral'}>
                      {ann.target_role.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] text-text-helper">
                      {new Date(ann.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
