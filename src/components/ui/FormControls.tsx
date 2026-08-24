import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

type ControlShape = 'pill' | 'rounded' | 'soft';
type ControlTone = 'deep' | 'soft' | 'ocean';

const baseControl = 'glass-field-control min-w-0 w-full border border-white/10 px-4 py-3 text-sm font-medium text-white transition placeholder:text-ocean-500 disabled:cursor-not-allowed disabled:opacity-[var(--disabled-opacity)] aria-[invalid=true]:border-red-300/55 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-red-400/10';
const shapes: Record<ControlShape, string> = { pill: 'rounded-full', rounded: 'rounded-xl', soft: 'rounded-2xl' };
const tones: Record<ControlTone, string> = { deep: 'bg-ocean-950/70', soft: 'bg-ocean-950/50', ocean: 'bg-ocean-900/70' };

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  shape?: ControlShape;
  startIcon?: ReactNode;
  tone?: ControlTone;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, shape = 'rounded', startIcon, tone = 'soft', ...props }, ref) {
  const input = <input ref={ref} className={cn(baseControl, shapes[shape], tones[tone], startIcon && 'pl-11', className)} {...props} />;
  if (!startIcon) return input;
  return <span className="relative block"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ocean-500" aria-hidden="true">{startIcon}</span>{input}</span>;
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  shape?: ControlShape;
  tone?: ControlTone;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, shape = 'rounded', tone = 'soft', ...props }, ref) {
  return <select ref={ref} className={cn(baseControl, shapes[shape], tones[tone], className)} {...props} />;
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  shape?: ControlShape;
  startIcon?: ReactNode;
  tone?: ControlTone;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className, shape = 'soft', startIcon, tone = 'soft', ...props }, ref) {
  const textarea = <textarea ref={ref} className={cn(baseControl, 'resize-y', shapes[shape], tones[tone], startIcon && 'pl-11', className)} {...props} />;
  if (!startIcon) return textarea;
  return <span className="relative block"><span className="pointer-events-none absolute left-4 top-3 text-ocean-500" aria-hidden="true">{startIcon}</span>{textarea}</span>;
});
