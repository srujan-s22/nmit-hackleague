export interface ButtonStyleOptions {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function getButtonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: ButtonStyleOptions = {}): string {
  const base =
    'inline-flex items-center justify-center font-medium rounded-sm transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-border-focus ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const variants: Record<NonNullable<ButtonStyleOptions['variant']>, string> = {
    primary:
      'bg-surface-inverse text-text-inverse hover:bg-neutral-800 active:bg-neutral-900 border border-transparent shadow-xs',
    secondary:
      'bg-surface-subtle text-text-primary hover:bg-surface-muted active:bg-neutral-200 border border-border-subtle shadow-xs',
    outline:
      'bg-transparent text-text-primary hover:bg-surface-subtle active:bg-surface-muted border border-border-interactive shadow-xs',
    tertiary:
      'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-subtle active:bg-surface-muted border border-transparent',
    destructive:
      'bg-status-error-bg text-status-error-text hover:bg-red-100 active:bg-red-200 border border-status-error-border shadow-xs',
  };

  const sizes: Record<NonNullable<ButtonStyleOptions['size']>, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 min-h-[32px]',
    md: 'text-sm px-4 py-2 gap-2 min-h-[40px]',
    lg: 'text-base px-5 py-2.5 gap-2.5 min-h-[48px]',
  };

  const width = fullWidth ? 'w-full' : 'w-auto';

  return `${base} ${variants[variant]} ${sizes[size]} ${width}`;
}
