import type { ButtonHTMLAttributes, LabelHTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

interface ChoiceCardBaseProps extends PropsWithChildren {
  className?: string;
  disabled?: boolean;
  selected?: boolean;
  shape?: 'rounded' | 'soft';
}

type ChoiceCardProps = ChoiceCardBaseProps & (
  | ({ as?: 'button' } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'disabled'>)
  | ({ as: 'label' } & Omit<LabelHTMLAttributes<HTMLLabelElement>, 'children'>)
);

const shapes = {
  rounded: 'rounded-xl',
  soft: 'rounded-2xl',
};

export function ChoiceCard(props: ChoiceCardProps) {
  const { as = 'button', children, className, disabled = false, selected = false, shape = 'rounded', ...rest } = props;
  const classes = cn(
    'glass-control glass-interactive glass-focus-ring min-w-0',
    shapes[shape],
    className,
  );

  if (as === 'label') {
    return <label className={classes} data-selected={selected || undefined} {...(rest as LabelHTMLAttributes<HTMLLabelElement>)}>{children}</label>;
  }

  return (
    <button
      aria-pressed={selected}
      className={classes}
      disabled={disabled}
      type="button"
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
