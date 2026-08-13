import { cn } from '../../utils/cn';

interface SectionTitleProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
}

export function SectionTitle({ eyebrow, title, description, align = 'center' }: SectionTitleProps) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow ? <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean-400">{eyebrow}</p> : null}
      <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-7 text-ocean-200 sm:text-lg">{description}</p> : null}
    </div>
  );
}
