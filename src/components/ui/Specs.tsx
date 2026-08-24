import type { LucideIcon } from 'lucide-react';
import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '../../utils/cn';

export function SpecsGrid({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn('mt-4 grid grid-cols-3 gap-2', className)}>{children}</span>;
}

interface SpecItemProps {
  icon: LucideIcon;
  label?: ReactNode;
  value: ReactNode;
}

export function SpecItem({ icon: Icon, label, value }: SpecItemProps) {
  return (
    <span className="glass-control flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 py-2.5 text-center text-[0.7rem] font-medium leading-tight text-ocean-100">
      <Icon aria-hidden="true" className="size-[0.9375rem] shrink-0 text-ocean-400" strokeWidth={2} />
      {label ? <span className="w-full truncate text-[0.65rem] text-ocean-300">{label}</span> : null}
      <span className="w-full truncate">{value}</span>
    </span>
  );
}
