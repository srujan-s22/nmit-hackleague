'use client';

import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      helperText,
      error,
      leftAddon,
      rightAddon,
      className = '',
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

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
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary select-none"
          >
            {label}
            {required && <span className="text-status-error-text ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-text-secondary">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={`w-full rounded-sm bg-surface-canvas text-sm text-text-primary placeholder:text-text-helper
              border transition-colors min-h-[40px] py-2
              ${leftAddon ? 'pl-10' : 'pl-3'}
              ${rightAddon ? 'pr-10' : 'pr-3'}
              ${
                error
                  ? 'border-status-error-border focus:ring-status-error-border text-status-error-text'
                  : 'border-border-interactive hover:border-text-primary'
              }
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-border-focus
              disabled:bg-surface-subtle disabled:border-border-subtle disabled:text-text-disabled disabled:cursor-not-allowed
              shadow-xs ${className}`.trim()}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-2.5 flex items-center text-text-secondary z-10">
              {rightAddon}
            </div>
          )}
        </div>

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

Input.displayName = 'Input';
