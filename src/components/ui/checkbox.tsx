'use client';

import React, { useId } from 'react';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  helperText?: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      id,
      label,
      helperText,
      error,
      className = '',
      disabled,
      checked,
      defaultChecked,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;
    const helperId = `${checkboxId}-helper`;
    const errorId = `${checkboxId}-error`;

    const describedBy = [
      error ? errorId : null,
      helperText ? helperId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1 ${className}`.trim()}>
        <label
          htmlFor={checkboxId}
          className={`inline-flex items-start gap-2.5 select-none ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
        >
          <div className="relative flex items-center pt-0.5">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              checked={checked}
              defaultChecked={defaultChecked}
              aria-invalid={!!error}
              aria-describedby={describedBy}
              className="peer sr-only"
              {...props}
            />
            <div
              className={`w-4.5 h-4.5 rounded-xs border transition-colors flex items-center justify-center
                ${
                  error
                    ? 'border-status-error-border'
                    : 'border-border-interactive hover:border-text-primary'
                }
                bg-surface-canvas peer-checked:bg-surface-inverse peer-checked:border-surface-inverse
                peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-border-focus
                peer-disabled:bg-surface-subtle peer-disabled:border-border-subtle shadow-xs`}
              aria-hidden="true"
            >
              <svg
                className="w-3.5 h-3.5 text-text-inverse stroke-current opacity-0 peer-checked:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          {label && (
            <span className="text-sm font-medium text-text-primary leading-tight">
              {label}
            </span>
          )}
        </label>

        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-status-error-text pl-7">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-text-helper pl-7">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
