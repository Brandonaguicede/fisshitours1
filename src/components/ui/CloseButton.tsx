import { X } from 'lucide-react';

import { IconButton } from './IconButton';

interface CloseButtonProps {
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

export function CloseButton({ className, disabled, label, onClick }: CloseButtonProps) {
  return <IconButton className={className} disabled={disabled} icon={X} label={label} onClick={onClick} size="xs" />;
}
