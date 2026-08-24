import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../utils/cn';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'glass' | 'subtle' | 'ghost';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  href?: string;
  icon: LucideIcon;
  label: string;
  size?: IconButtonSize;
  target?: string;
  variant?: IconButtonVariant;
}

const sizes: Record<IconButtonSize, { button: string; icon: string }> = {
  xs: { button: 'size-8', icon: 'size-[15px]' },
  sm: { button: 'size-9', icon: 'size-[var(--control-icon-sm)]' },
  md: { button: 'size-10', icon: 'size-[var(--control-icon-md)]' },
  lg: { button: 'size-12', icon: 'size-[var(--control-icon-lg)]' },
};

const variants: Record<IconButtonVariant, string> = {
  glass: 'glass-control text-white',
  subtle: 'glass-subtle text-ocean-100',
  ghost: 'bg-transparent text-ocean-100',
};

export function IconButton({
  className,
  disabled,
  href,
  icon: Icon,
  label,
  size = 'md',
  target,
  type = 'button',
  variant = 'glass',
  ...props
}: IconButtonProps) {
  const metrics = sizes[size];
  const classes = cn(
    'glass-focus-ring glass-interactive grid shrink-0 place-items-center rounded-[var(--radius-pill)]',
    variants[variant],
    metrics.button,
    className,
  );

  if (href) {
    return (
      <a
        aria-label={label}
        className={cn(classes, disabled && 'ui-disabled')}
        href={disabled ? undefined : href}
        rel={target === '_blank' ? 'noreferrer' : undefined}
        tabIndex={disabled ? -1 : undefined}
        target={target}
      >
        <Icon aria-hidden="true" className={metrics.icon} strokeWidth={2} />
      </a>
    );
  }

  return (
    <button
      aria-label={label}
      className={classes}
      disabled={disabled}
      type={type}
      {...props}
    >
      <Icon aria-hidden="true" className={metrics.icon} strokeWidth={2} />
    </button>
  );
}
