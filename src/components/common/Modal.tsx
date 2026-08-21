import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, titleId, children, className }: ModalProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const modal = (
    <AnimatePresence>
      {open ? (
        <div className="app-modal-root">
          <motion.div
            className="app-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
            aria-hidden="true"
          />
          <div className="app-modal-stage">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={cn('app-modal-panel outline-none', className)}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97, y: reduceMotion ? 0 : 8 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
