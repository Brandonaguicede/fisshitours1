import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { useDismissOnOutsideClick } from '../../hooks/useDismissOnOutsideClick';
import { cn } from '../../utils/cn';
import { Chip } from './Chip';
import { CloseButton } from './CloseButton';

export interface FilterMenuOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterMenuProps {
  /** Trigger label, e.g. "Filtros" / "Filters". */
  label: string;
  ariaLabel: string;
  /** Full option list, including the "show everything" entry. */
  options: FilterMenuOption[];
  /** The option value that means "no filter applied". */
  clearValue: string;
  value: string;
  onChange: (value: string) => void;
  clearLabel: string;
  className?: string;
}

/**
 * Compact glass filter control shared by Tours and Gallery: a single trigger
 * that opens a floating popover on desktop and a bottom sheet on mobile
 * (pure CSS breakpoint switch, same markup). Single-select by design — both
 * call sites filter by one dimension at a time.
 */
export function FilterMenu({ label, ariaLabel, options, clearValue, value, onChange, clearLabel, className }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const active = value !== clearValue;
  const activeOption = options.find((option) => option.value === value);

  useDismissOnOutsideClick(open, [triggerRef, panelRef], () => setOpen(false));

  function select(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'glass-control glass-interactive glass-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-extrabold text-ocean-100',
            active && 'text-white',
          )}
          data-selected={active || undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <SlidersHorizontal aria-hidden="true" size={15} />
          {label}
          <ChevronDown aria-hidden="true" className={cn('transition-transform duration-200', open && 'rotate-180')} size={15} />
        </button>

        {active ? (
          <Chip className="gap-1.5 pr-1.5" tone="accent">
            {activeOption?.label ?? value}
            <button
              type="button"
              aria-label={clearLabel}
              className="glass-focus-ring grid size-4 shrink-0 place-items-center rounded-full text-ocean-300 transition-colors hover:text-white"
              onClick={() => onChange(clearValue)}
            >
              <X aria-hidden="true" size={12} />
            </button>
          </Chip>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ocean-950/55 sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              aria-hidden="true"
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={panelRef}
              role="menu"
              aria-label={ariaLabel}
              className={cn(
                'glass-nav fixed inset-x-3 bottom-3 z-50 rounded-[var(--radius-panel)] p-3',
                'sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-30 sm:mt-2 sm:w-64 sm:p-2',
              )}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="flex items-center justify-between px-1 pb-2 sm:hidden">
                <p className="text-sm font-extrabold text-white">{label}</p>
                <CloseButton label={clearLabel} onClick={() => setOpen(false)} />
              </div>

              <div className="grid gap-1" role="none">
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      className={cn(
                        'glass-focus-ring flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm font-semibold text-ocean-100 transition-colors duration-150',
                        'hover:bg-white/[0.06]',
                        isSelected && 'bg-white/[0.09] text-white',
                      )}
                      onClick={() => select(option.value)}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{option.label}</span>
                        {typeof option.count === 'number' ? (
                          <span className="shrink-0 text-xs font-medium text-ocean-400">({option.count})</span>
                        ) : null}
                      </span>
                      {isSelected ? <Check aria-hidden="true" className="shrink-0 text-seafoam-400" size={16} /> : null}
                    </button>
                  );
                })}
              </div>

              {active ? (
                <button
                  type="button"
                  className="glass-focus-ring mt-1 w-full rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm font-bold text-ocean-300 transition-colors duration-150 hover:text-white"
                  onClick={() => select(clearValue)}
                >
                  {clearLabel}
                </button>
              ) : null}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
