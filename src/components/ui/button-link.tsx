import Link, { LinkProps } from 'next/link';
import React from 'react';
import { getButtonClasses, ButtonStyleOptions } from './button-styles';

export interface ButtonLinkProps extends LinkProps, ButtonStyleOptions {
  children: React.ReactNode;
  className?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  id?: string;
  target?: string;
  rel?: string;
  'aria-label'?: string;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  ...props
}: ButtonLinkProps) {
  const computedClass = `${getButtonClasses({ variant, size, fullWidth })} ${className}`.trim();

  return (
    <Link href={href} className={computedClass} {...props}>
      {leftIcon && <span className="inline-flex shrink-0 items-center">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="inline-flex shrink-0 items-center">{rightIcon}</span>}
    </Link>
  );
}
