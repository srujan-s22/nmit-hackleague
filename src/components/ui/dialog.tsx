'use client';

import React, { useEffect, useRef } from 'react';
import { IconButton } from './icon-button';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Manage showModal / close lifecycle and focus restoration
  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

      if (!dialogElement.open) {
        dialogElement.showModal();
      }
      document.body.style.overflow = 'hidden';
    } else {
      if (dialogElement.open) {
        dialogElement.close();
      }
      document.body.style.overflow = '';
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-desc' : undefined}
      className={`fixed inset-0 m-auto w-full ${maxWidthClasses[maxWidth]} rounded-md border border-border-subtle bg-surface-canvas text-text-primary p-0 shadow-dialog backdrop:bg-surface-inverse/45 backdrop:backdrop-blur-xs open:flex open:flex-col overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-border-subtle bg-surface-subtle/50">
        <div className="flex flex-col gap-1 pr-4">
          <h2 id="dialog-title" className="text-base font-semibold text-text-primary leading-tight">
            {title}
          </h2>
          {description && (
            <p id="dialog-desc" className="text-xs text-text-secondary leading-normal">
              {description}
            </p>
          )}
        </div>
        <IconButton
          icon={
            <svg
              className="w-4 h-4 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          }
          aria-label="Close dialog"
          variant="ghost"
          size="sm"
          onClick={onClose}
        />
      </div>

      {/* Body Content */}
      <div className="p-5 overflow-y-auto max-h-[70vh] text-sm text-text-primary leading-relaxed">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="p-4 sm:p-5 border-t border-border-subtle bg-surface-subtle/30 flex items-center justify-end gap-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
