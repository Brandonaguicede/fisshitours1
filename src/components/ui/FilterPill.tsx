import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement>, PropsWithChildren {
  active?: boolean;
}

export function FilterPill({ active = false, children, className, disabled, type = 'button', ...props }: FilterPillProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'glass-control glass-interactive glass-focus-ring shrink-0 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-extrabold text-ocean-100',
        active && 'text-white',
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
