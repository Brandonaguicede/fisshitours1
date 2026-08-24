import { createElement } from 'react';
import type { ComponentPropsWithoutRef, ElementType, ImgHTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';
import { Button } from './Button';

type CardShellProps<T extends ElementType = 'div'> = PropsWithChildren<{
  as?: T;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
}> & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function CardShell<T extends ElementType = 'div'>({
  as,
  children,
  className,
  interactive = false,
  selected = false,
  ...props
}: CardShellProps<T>) {
  return createElement(
    as ?? 'div',
    {
      ...props,
      'data-selected': selected || undefined,
      className: cn(
        'glass-surface flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)]',
        interactive && 'glass-interactive glass-focus-ring group appearance-none p-0 text-left',
        className,
      ),
    },
    children,
  );
}

interface CardMediaProps extends Pick<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'decoding' | 'loading' | 'onError' | 'src'> {
  className?: string;
  imageClassName?: string;
  title?: string;
  variant?: 'default' | 'gallery';
}

export function CardMedia({ alt, className, decoding = 'async', imageClassName, loading = 'lazy', onError, src, title, variant = 'default' }: CardMediaProps) {
  return (
    <span className={cn('relative block w-full shrink-0 overflow-hidden bg-ocean-900', variant === 'default' ? 'h-48 sm:h-52' : 'aspect-[4/3]', className)}>
      <img
        alt={alt}
        className={cn('absolute inset-0 h-full w-full object-cover transition duration-500', variant === 'default' ? 'group-hover:scale-[1.025]' : 'duration-700 group-hover:scale-105', imageClassName)}
        decoding={decoding}
        loading={loading}
        onError={onError}
        src={src}
      />
      {variant === 'default' ? <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-transparent to-ocean-950/10" /> : null}
      {title ? <span className="absolute inset-x-5 bottom-4"><span className="block font-display text-[1.75rem] font-semibold leading-none text-white">{title}</span></span> : null}
    </span>
  );
}

export function CardContent({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <span className={cn('flex w-full flex-1 flex-col p-4 sm:p-5', className)}>{children}</span>;
}

export function CardActions({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <Button as="span" className={cn('mt-4', className)} fullWidth size="sm" variant="primary">
      {children}
    </Button>
  );
}
