import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, MouseEventHandler, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'glass' | 'ghost' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, PropsWithChildren {
  as?: 'button' | 'span';
  fullWidth?: boolean;
  href?: string;
  size?: ButtonSize;
  target?: string;
  to?: string;
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'glass-primary text-ocean-950',
  secondary: 'glass-control bg-ocean-700/65 text-white',
  glass: 'glass-control text-white',
  ghost: 'bg-transparent text-ocean-100',
  subtle: 'glass-subtle text-ocean-100',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'min-h-[2.25rem] px-4 py-1.5 text-xs',
  sm: 'min-h-[var(--control-height-sm)] px-5 py-2 text-sm',
  md: 'min-h-[var(--control-height-md)] px-5 py-2.5 text-sm',
  lg: 'min-h-[var(--control-height-lg)] px-6 py-3 text-base',
};

export function Button({
  as = 'button',
  children,
  className,
  disabled,
  fullWidth = false,
  href,
  onClick,
  size = 'md',
  target,
  to,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] text-center font-semibold leading-tight',
    as !== 'span' && 'glass-focus-ring glass-interactive',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className,
  );

  if (to) {
    return (
      <Link
        aria-disabled={disabled || undefined}
        className={cn(classes, disabled && 'ui-disabled')}
        onClick={onClick as unknown as MouseEventHandler<HTMLAnchorElement>}
        tabIndex={disabled ? -1 : undefined}
        to={to}
      >
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        aria-disabled={disabled || undefined}
        className={cn(classes, disabled && 'ui-disabled')}
        href={disabled ? undefined : href}
        onClick={onClick as unknown as MouseEventHandler<HTMLAnchorElement>}
        rel={target === '_blank' ? 'noreferrer' : undefined}
        tabIndex={disabled ? -1 : undefined}
        target={target}
      >
        {children}
      </a>
    );
  }

  if (as === 'span') {
    return <span className={classes}>{children}</span>;
  }

  return (
    <button className={classes} disabled={disabled} onClick={onClick} type={type} {...props}>
      {children}
    </button>
  );
}
