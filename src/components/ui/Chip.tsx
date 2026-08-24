import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

interface ChipProps extends HTMLAttributes<HTMLSpanElement>, PropsWithChildren {
  tone?: 'neutral' | 'accent';
}

export function Chip({ children, className, tone = 'neutral', ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'glass-control inline-flex min-h-7 items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium',
        tone === 'neutral' ? 'text-ocean-100' : 'text-ocean-300',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
