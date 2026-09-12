import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/cn';

export type SectionHeaderVariant = 'default' | 'compact' | 'feature' | 'hero' | 'heroWide';

interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  actions?: ReactNode;
  align?: 'left' | 'center';
  description?: string;
  eyebrow?: string;
  level?: 1 | 2;
  title: string;
  variant?: SectionHeaderVariant;
}

const contentStyles: Record<SectionHeaderVariant, string> = {
  default: 'max-w-3xl',
  compact: 'max-w-2xl',
  feature: 'max-w-3xl',
  hero: 'max-w-2xl',
  heroWide: 'max-w-4xl',
};

const eyebrowStyles: Record<SectionHeaderVariant, string> = {
  default: 'text-sm font-bold uppercase tracking-[0.14em] text-ocean-400',
  compact: 'text-xs font-bold uppercase tracking-[0.14em] text-ocean-400',
  feature: 'text-sm font-bold uppercase tracking-[0.14em] text-ocean-400',
  hero: 'text-sm font-bold uppercase tracking-[0.16em] text-ocean-200',
  heroWide: 'text-sm font-bold uppercase tracking-[0.16em] text-ocean-200',
};

/*
 * Fluid clamp() scales instead of a single sm: breakpoint jump: the title
 * grows smoothly with viewport width and caps at a moderate size, so it
 * reads as "important" without dominating the viewport at 1366/1920 — and
 * without a hard jump right at 640px either.
 */
const titleStyles: Record<SectionHeaderVariant, string> = {
  default: 'mt-2.5 font-display font-extrabold leading-[1.08] text-white [font-size:clamp(1.7rem,1.32rem+1.7vw,2.5rem)]',
  compact: 'mt-2 font-display font-extrabold leading-tight text-white [font-size:clamp(1.4rem,1.22rem+0.8vw,1.75rem)]',
  feature: 'mt-2.5 font-display font-extrabold leading-[1.06] text-white [font-size:clamp(1.9rem,1.5rem+1.8vw,2.75rem)]',
  hero: 'mt-3 font-display font-extrabold leading-[1.02] text-white [font-size:clamp(2.25rem,1.7rem+2.4vw,3.25rem)]',
  heroWide: 'mt-3.5 font-display font-extrabold leading-[0.98] text-white [font-size:clamp(2.5rem,1.8rem+3vw,3.75rem)]',
};

const descriptionStyles: Record<SectionHeaderVariant, string> = {
  default: 'mt-3 text-base leading-7 text-ocean-200 sm:text-lg',
  compact: 'mt-2.5 text-sm leading-6 text-ocean-200',
  feature: 'mt-3 text-base leading-7 text-ocean-200 sm:text-lg',
  hero: 'mt-3 max-w-xl text-sm font-semibold leading-6 text-ocean-200',
  heroWide: 'mt-4 max-w-2xl text-lg font-semibold leading-8 text-ocean-100',
};

export function SectionHeader({ actions, align = 'center', className, description, eyebrow, level = 2, title, variant = 'default', ...props }: SectionHeaderProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  const content = (
    <div className={cn(contentStyles[variant], align === 'center' && 'mx-auto text-center')}>
      {eyebrow ? <p className={eyebrowStyles[variant]}>{eyebrow}</p> : null}
      <Heading className={titleStyles[variant]}>{title}</Heading>
      {description ? <p className={cn(descriptionStyles[variant], align === 'center' && 'mx-auto')}>{description}</p> : null}
    </div>
  );

  return (
    <div className={cn(actions && 'flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between', className)} {...props}>
      {content}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
