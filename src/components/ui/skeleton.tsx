import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
}

export function Skeleton({
  variant = 'rectangular',
  className = '',
  ...props
}: SkeletonProps) {
  const variants = {
    text: 'h-4 w-full rounded-xs',
    circular: 'rounded-full',
    rectangular: 'rounded-sm',
  };

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-surface-muted ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
