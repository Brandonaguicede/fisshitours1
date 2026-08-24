import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

interface ContainerProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {}

export function Container({ children, className, ...props }: ContainerProps) {
  return <div className={cn('mx-auto w-full max-w-[var(--layout-container-max)] px-[var(--layout-gutter)]', className)} {...props}>{children}</div>;
}
