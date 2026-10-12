import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  className = '',
  ...props
}: BadgeProps) {
  const base =
    'inline-flex items-center font-medium rounded-xs border select-none transition-colors';

  const variants: Record<NonNullable<BadgeProps['variant']>, { badge: string; dot: string }> = {
    neutral: {
      badge: 'bg-surface-subtle text-text-primary border-border-subtle',
      dot: 'bg-text-secondary',
    },
    success: {
      badge: 'bg-status-success-bg text-status-success-text border-status-success-border',
      dot: 'bg-status-success-text',
    },
    error: {
      badge: 'bg-status-error-bg text-status-error-text border-status-error-border',
      dot: 'bg-status-error-text',
    },
    warning: {
      badge: 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
      dot: 'bg-status-warning-text',
    },
    info: {
      badge: 'bg-status-info-bg text-status-info-text border-status-info-border',
      dot: 'bg-status-info-text',
    },
  };

  const sizes: Record<NonNullable<BadgeProps['size']>, string> = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-0.5 gap-1.5',
  };

  const activeVariant = variants[variant];
  const computedClass = `${base} ${activeVariant.badge} ${sizes[size]} ${className}`.trim();

  return (
    <span className={computedClass} {...props}>
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${activeVariant.dot} shrink-0`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
}
