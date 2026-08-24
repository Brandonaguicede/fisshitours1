import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

interface PriceLabelProps {
  className?: string;
  label: ReactNode;
  value: ReactNode;
}

export function PriceLabel({ className, label, value }: PriceLabelProps) {
  return <span className={cn('text-sm font-semibold text-ocean-200', className)}>{label} {value}</span>;
}
