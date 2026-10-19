'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  getInAppNotificationsAction,
  markNotificationReadAction,
  type InAppNotification,
} from '@/actions/notification-actions';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    const res = await getInAppNotificationsAction();
    if (res.success) {
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    }
  };

  const handleManualRefresh = async () => {
    setIsLoading(true);
    await fetchNotifications();
    setIsLoading(false);
  };

  useEffect(() => {
    let isMounted = true;
    getInAppNotificationsAction().then((res) => {
      if (isMounted && res.success) {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      }
    });

    const interval = setInterval(() => {
      getInAppNotificationsAction().then((res) => {
        if (isMounted && res.success) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
        }
      });
    }, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await markNotificationReadAction(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        className="relative p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus"
      >
        <svg
          className="w-5 h-5 stroke-current"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-status-error-border rounded-full border-2 border-surface-canvas animate-in zoom-in">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border-subtle bg-surface-canvas shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-muted/40">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-status-info-bg text-status-info-text font-medium border border-status-info-border">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="text-xs text-text-helper hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle/50">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-text-helper text-xs">
                <svg
                  className="w-8 h-8 stroke-current mx-auto mb-2 opacity-40"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                No notifications or broadcasts yet.
              </div>
            ) : (
              notifications.map((ann) => (
                <div
                  key={ann.id}
                  className={`p-3.5 transition-colors hover:bg-surface-muted/30 ${
                    !ann.is_read ? 'bg-status-info-bg/15' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-text-primary leading-tight">
                      {ann.title}
                    </span>
                    {!ann.is_read && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(ann.id, e)}
                        className="text-[11px] text-accent-primary hover:underline shrink-0"
                        title="Mark as read"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                    {ann.message}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-text-helper">
                    <span>
                      {new Date(ann.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {ann.target_role !== 'all' && (
                      <span className="uppercase text-[9px] font-semibold tracking-wider text-text-helper">
                        {ann.target_role}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
