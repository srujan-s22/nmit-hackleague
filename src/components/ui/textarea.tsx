'use client';

import React, { useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      id,
      label,
      helperText,
      error,
      className = '',
      disabled,
      required,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const helperId = `${textareaId}-helper`;
    const errorId = `${textareaId}-error`;

    const describedBy = [
      error ? errorId : null,
      helperText ? helperId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-text-primary select-none"
          >
            {label}
            {required && <span className="text-status-error-text ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`w-full rounded-sm bg-surface-canvas text-sm text-text-primary placeholder:text-text-helper
            border transition-colors px-3 py-2
            ${
              error
                ? 'border-status-error-border focus:ring-status-error-border text-status-error-text'
                : 'border-border-interactive hover:border-text-primary'
            }
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-border-focus
            disabled:bg-surface-subtle disabled:border-border-subtle disabled:text-text-disabled disabled:cursor-not-allowed
            shadow-xs resize-y ${className}`.trim()}
          {...props}
        />

        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-status-error-text">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-text-helper">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
