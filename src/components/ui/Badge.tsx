import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, PropsWithChildren {
  variant?: 'glass' | 'active' | 'subtle';
}

const variants = {
  glass: 'glass-control text-white/85',
  active: 'glass-control glass-selected text-white',
  subtle: 'glass-subtle text-ocean-200',
} as const;

export function Badge({ children, className, variant = 'glass', ...props }: BadgeProps) {
  return <span className={cn('inline-flex min-h-7 items-center rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold', variants[variant], className)} {...props}>{children}</span>;
}
