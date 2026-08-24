import type { HTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

export type GlassPanelVariant = 'surface' | 'panel' | 'control' | 'active' | 'subtle';

interface GlassPanelProps extends HTMLAttributes<HTMLElement>, PropsWithChildren {
  as?: 'article' | 'aside' | 'div' | 'fieldset' | 'nav' | 'section' | 'span';
  shape?: 'circle' | 'panel' | 'pill';
  variant?: GlassPanelVariant;
}

const variants: Record<GlassPanelVariant, string> = {
  surface: 'glass-surface',
  panel: 'glass-panel',
  control: 'glass-control',
  active: 'glass-control glass-selected',
  subtle: 'glass-subtle',
};

const shapes = {
  circle: 'rounded-full',
  panel: 'rounded-[var(--radius-panel)]',
  pill: 'rounded-[var(--radius-pill)]',
};

export function GlassPanel({ as: Component = 'div', children, className, shape = 'panel', variant = 'panel', ...props }: GlassPanelProps) {
  return (
    <Component className={cn(shapes[shape], variants[variant], className)} {...props}>
      {children}
    </Component>
  );
}
