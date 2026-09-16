import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

interface PriceLabelProps {
  className?: string;
  label: ReactNode;
  value: ReactNode;
}

export function PriceLabel({ className, label, value }: PriceLabelProps) {
  return <span className={cn('text-[0.8rem] font-semibold text-celeste', className)}>{label} {value}</span>;
}
