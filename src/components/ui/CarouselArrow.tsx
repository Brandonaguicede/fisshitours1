import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../../utils/cn';
import { IconButton, type IconButtonSize, type IconButtonVariant } from './IconButton';

interface CarouselArrowProps {
  className?: string;
  direction: 'left' | 'right';
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
}

export function CarouselArrow({ className, direction, disabled, label, onClick, size = 'md', variant = 'glass' }: CarouselArrowProps) {
  return (
    <IconButton
      className={cn('text-celeste hover:text-celeste-light', className)}
      disabled={disabled}
      icon={direction === 'left' ? ChevronLeft : ChevronRight}
      label={label}
      onClick={onClick}
      size={size}
      variant={variant}
    />
  );
}
