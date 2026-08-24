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

const titleStyles: Record<SectionHeaderVariant, string> = {
  default: 'mt-3 font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl',
  compact: 'mt-2 font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl',
  feature: 'mt-3 font-display text-4xl font-extrabold leading-tight text-white sm:text-5xl',
  hero: 'mt-3 font-display text-5xl font-extrabold leading-none text-white sm:text-6xl',
  heroWide: 'mt-4 font-display text-5xl font-extrabold leading-[0.95] text-white sm:text-6xl lg:text-7xl',
};

const descriptionStyles: Record<SectionHeaderVariant, string> = {
  default: 'mt-4 text-base leading-7 text-ocean-200 sm:text-lg',
  compact: 'mt-3 text-sm leading-6 text-ocean-200',
  feature: 'mt-4 text-base leading-7 text-ocean-200 sm:text-lg',
  hero: 'mt-3 max-w-xl text-sm font-semibold leading-6 text-ocean-200',
  heroWide: 'mt-6 max-w-2xl text-lg font-semibold leading-8 text-ocean-100',
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
