import type { ReactNode } from 'react';

interface ModalFooterProps {
  children: ReactNode;
}

export function ModalFooter({ children }: ModalFooterProps) {
  return <footer className="admin-modal-footer">{children}</footer>;
}

export default ModalFooter;
