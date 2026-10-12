'use client';

import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  'aria-label': string; // Mandatory for accessibility
  variant?: 'ghost' | 'outline' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      'aria-label': ariaLabel,
      variant = 'ghost',
      size = 'md',
      className = '',
      type = 'button',
      disabled,
      ...props
    },
    ref
  ) => {
    const base =
      'inline-flex items-center justify-center rounded-sm transition-colors ' +
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-border-focus ' +
      'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

    const variants: Record<NonNullable<IconButtonProps['variant']>, string> = {
      ghost:
        'text-text-secondary hover:text-text-primary hover:bg-surface-subtle active:bg-surface-muted border border-transparent',
      outline:
        'text-text-primary bg-transparent border border-border-interactive hover:bg-surface-subtle active:bg-surface-muted shadow-xs',
      secondary:
        'text-text-primary bg-surface-subtle border border-border-subtle hover:bg-surface-muted active:bg-neutral-200 shadow-xs',
    };

    const sizes: Record<NonNullable<IconButtonProps['size']>, string> = {
      sm: 'w-8 h-8 p-1.5 min-w-[32px] min-h-[32px]',
      md: 'w-10 h-10 p-2 min-w-[40px] min-h-[40px]',
      lg: 'w-12 h-12 p-3 min-w-[48px] min-h-[48px]',
    };

    const computedClass = `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();

    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        disabled={disabled}
        className={computedClass}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
