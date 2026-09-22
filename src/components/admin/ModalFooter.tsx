import type { ReactNode } from 'react';

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return <footer className={`admin-modal-footer${className ? ` ${className}` : ''}`}>{children}</footer>;
}

export default ModalFooter;
