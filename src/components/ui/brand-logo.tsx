import Image from 'next/image';
import React from 'react';

export interface BrandLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  asset: 'nmit' | 'hackleague' | 'combined';
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  priority?: boolean;
}

export function BrandLogo({
  asset,
  variant = 'light',
  size = 'md',
  priority = false,
  className = '',
  ...props
}: BrandLogoProps) {
  // Sizing dimensions maintaining accurate native aspect ratios:
  // nmit-logo.svg: viewBox="0 0 669 63" (~10.62:1)
  // Group 3.svg: viewBox="0 0 585 641" (~0.91:1)

  const nmitDimensions = {
    sm: { width: 255, height: 24 },
    md: { width: 340, height: 32 },
    lg: { width: 425, height: 40 },
  };

  const hackleagueDimensions = {
    sm: { width: 26, height: 28 },
    md: { width: 33, height: 36 },
    lg: { width: 44, height: 48 },
  };

  if (asset === 'nmit') {
    const dim = nmitDimensions[size];
    return (
      <div className={`inline-flex items-center shrink-0 ${className}`.trim()} {...props}>
        <Image
          src="/nmit-logo.svg"
          alt="Nitte Meenakshi Institute of Technology — Official Institutional Logo"
          width={dim.width}
          height={dim.height}
          priority={priority}
          className="h-auto max-w-full select-none"
        />
      </div>
    );
  }

  if (asset === 'hackleague') {
    const dim = hackleagueDimensions[size];
    return (
      <div
        className={`inline-flex items-center justify-center rounded-md border border-border-subtle bg-surface-subtle p-1 shrink-0 ${className}`.trim()}
        {...props}
      >
        <Image
          src="/Group 3.svg"
          alt="NMIT HackLeague — Official Portal Emblem"
          width={dim.width}
          height={dim.height}
          priority={priority}
          className="select-none"
        />
      </div>
    );
  }

  // Combined Lockup
  const hlDim = hackleagueDimensions[size];
  const isDark = variant === 'dark';

  return (
    <div
      className={`inline-flex items-center gap-3 shrink-0 ${className}`.trim()}
      {...props}
    >
      <div className="flex items-center justify-center rounded-md border border-border-subtle bg-surface-subtle p-1 shrink-0">
        <Image
          src="/Group 3.svg"
          alt="NMIT HackLeague — Official Portal Emblem"
          width={hlDim.width}
          height={hlDim.height}
          priority={priority}
          className="select-none"
        />
      </div>
      <div className="flex flex-col">
        <span
          className={`font-bold tracking-tight leading-tight ${
            size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'
          } ${isDark ? 'text-text-inverse' : 'text-text-primary'}`}
        >
          NMIT <span className="font-semibold text-text-secondary">HackLeague</span>
        </span>
      </div>
    </div>
  );
}
