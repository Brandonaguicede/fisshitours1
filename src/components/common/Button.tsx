import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, PropsWithChildren {
  variant?: ButtonVariant;
  to?: string;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ocean-500 text-ocean-950 shadow-soft hover:-translate-y-0.5 hover:bg-[#7ED8F4] hover:shadow-lifted',
  secondary: 'border border-white/15 bg-white/10 text-white shadow-soft hover:-translate-y-0.5 hover:border-ocean-300/60 hover:bg-white/15',
  ghost: 'bg-transparent text-ocean-100 hover:bg-white/10',
};

export function Button({ children, className, variant = 'primary', to, type = 'button', ...props }: ButtonProps) {
  const classes = cn(
    'focus-ring pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-center text-sm font-semibold leading-tight',
    variants[variant],
    className,
  );

  if (to) {
    return (
      <Link className={classes} to={to}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
