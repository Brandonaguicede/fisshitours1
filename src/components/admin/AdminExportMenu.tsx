import { Download, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface AdminExportOption {
  key: string;
  /** Visible name, e.g. "Excel (.xlsx)". */
  label: string;
  icon: LucideIcon;
  /** Hover hint that says exactly what will be downloaded. */
  title?: string;
  onSelect: () => void | Promise<void>;
}

/**
 * The single download control of the Admin: one icon-only trigger (Download) that opens a compact menu with the available
 * formats. It only opens/closes the menu and calls `onSelect`; generating the file stays with the screen. `busy` is the key
 * of the option being generated (the trigger then shows a spinner and every option is disabled until it finishes).
 *
 * Keyboard: Enter/Space/ArrowDown on the trigger open it and focus the first option; ArrowUp/ArrowDown/Home/End move between
 * options; Escape closes and returns focus to the trigger; Tab closes and moves on; a click outside closes.
 */
export function AdminExportMenu(props: { options: AdminExportOption[]; label?: string; busy?: string | false; disabled?: boolean }) {
  const label = props.label ?? 'Descargar';
  const busy = Boolean(props.busy);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  function select(option: AdminExportOption) {
    setOpen(false);
    triggerRef.current?.focus();
    void option.onSelect();
  }

  return (
    <div className="admin-export-menu">
      <button
        ref={triggerRef}
        className="admin-icon-btn admin-export-trigger"
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        disabled={props.disabled}
        onClick={() => { if (!busy) setOpen((value) => !value); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open && !busy) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} className="admin-export-panel" role="menu" aria-label={label} onKeyDown={onMenuKeyDown}>
          <p className="admin-export-panel__title" aria-hidden="true">{label}</p>
          {props.options.map((option) => (
            <button key={option.key} className="admin-export-panel__item" type="button" role="menuitem" title={option.title} onClick={() => select(option)}>
              <option.icon size={16} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default AdminExportMenu;
