import type { HTMLAttributes, LabelHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { cn } from '../../utils/cn';

interface FieldProps extends HTMLAttributes<HTMLDivElement>, PropsWithChildren {
  error?: string;
  errorId?: string;
  htmlFor: string;
  label: ReactNode;
  labelClassName?: string;
}

export function Field({ children, className, error, errorId, htmlFor, label, labelClassName, ...props }: FieldProps) {
  return (
    <div className={cn('grid min-w-0 gap-2', className)} {...props}>
      <FieldLabel className={labelClassName} htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldLabel({ children, className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-extrabold text-ocean-100', className)} {...props}>{children}</label>;
}

interface FieldErrorProps extends HTMLAttributes<HTMLParagraphElement>, PropsWithChildren {
  variant?: 'inline' | 'panel';
}

export function FieldError({ children, className, variant = 'inline', ...props }: FieldErrorProps) {
  return (
    <p
      aria-live="polite"
      className={cn(
        variant === 'inline' ? 'text-xs font-semibold text-red-200' : 'rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm font-bold text-red-100',
        className,
      )}
      role={variant === 'panel' ? 'alert' : undefined}
      {...props}
    >
      {children}
    </p>
  );
}
