import { Filter, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export function AdminPageHeader(props: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.actions ? <div className="admin-actions">{props.actions}</div> : null}
    </header>
  );
}

export function AdminStatCard(props: { label: string; value: string; icon: LucideIcon; tone?: 'ocean' | 'success' | 'warning' | 'danger' }) {
  return (
    <article className={`admin-stat-card admin-stat-card--${props.tone ?? 'ocean'}`}>
      <div className="admin-stat-card__head">
        <p className="admin-stat-card__label">{props.label}</p>
        <span className="admin-stat-card__icon"><props.icon size={18} /></span>
      </div>
      <strong className="admin-stat-card__value">{props.value}</strong>
    </article>
  );
}

export function AdminBadge({ value }: { value: string | boolean }) {
  const text = typeof value === 'boolean' ? (value ? 'Activo' : 'Inactivo') : value.split('_').join(' ');
  const normalized = String(value).toLowerCase();
  const tone =
    normalized.includes('paid') || normalized.includes('confirmed') || normalized === 'true' || normalized.includes('approved')
        ? 'success'
        : normalized.includes('pending') || normalized.includes('requested') || normalized.includes('day')
          ? 'warning'
          : normalized.includes('cancel') || normalized.includes('failed') || normalized.includes('rejected') || normalized === 'false'
            ? 'danger'
            : 'neutral';
  return <span className={`admin-badge admin-badge--${tone}`}>{text}</span>;
}

export function AdminTable(props: { headers: string[]; children: ReactNode; embedded?: boolean }) {
  return (
    <section className={props.embedded ? 'admin-table-card admin-table-card--embedded' : 'admin-table-card'}>
      <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="Tabla del panel administrativo">
        <table className="admin-table">
          <thead>
            <tr>{props.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>{props.children}</tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminToolbar(props: { children: ReactNode; embedded?: boolean }) {
  return <div className={props.embedded ? 'admin-toolbar admin-toolbar--embedded' : 'admin-toolbar'}>{props.children}</div>;
}

/**
 * Reuses the exact filter-menu markup/behavior already built for Reservas
 * (`admin-filter-menu`/`admin-filter-trigger`/`admin-filter-backdrop`/
 * `admin-filter-panel`) so every screen with real, existing filters gets the
 * same accessible popover instead of a loose `<select>` next to the table.
 */
export function AdminFilterMenu(props: {
  label?: string;
  panelLabel: string;
  panelTitle?: string;
  panelDescription?: string;
  activeCount?: number;
  onReset?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('select, input, textarea, button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="admin-filter-menu">
      <button ref={triggerRef} className="admin-btn admin-btn--secondary admin-filter-trigger" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Filter size={16} /> <span>{props.label ?? 'Filtros'}</span>
        {props.activeCount ? <AdminBadge value={String(props.activeCount)} /> : null}
      </button>
      {open ? (
        <>
          <div className="admin-filter-backdrop" aria-hidden="true" />
          <div ref={panelRef} id={panelId} className="admin-filter-panel" role="dialog" aria-label={props.panelLabel}>
            <div className="admin-filter-panel__header">
              <div>
                <strong>{props.panelTitle ?? 'Filtros'}</strong>
                {props.panelDescription ? <span>{props.panelDescription}</span> : null}
              </div>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar filtros" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={17} /></button>
            </div>
            {props.children}
            <div className="admin-filter-panel__actions">
              {props.onReset ? <button className="admin-btn admin-btn--ghost" type="button" disabled={!props.activeCount} onClick={props.onReset}>Limpiar</button> : <span />}
              <button className="admin-btn" type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Listo</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Shared search + filters + primary-action toolbar so every admin listing
 * uses the same layout instead of each screen inventing its own. Pass
 * `filters={<AdminFilterMenu ...>}` only when the screen has real, existing
 * filter dimensions; omit `onSearchChange`/`primaryAction` when a listing has
 * no search or is read-only.
 */
export function AdminListToolbar(props: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  filters?: ReactNode;
  primaryAction?: ReactNode;
  /** Renders after primaryAction — e.g. "Exportar". Order is always: buscar, filtros, crear, secundarias. */
  secondaryActions?: ReactNode;
  embedded?: boolean;
}) {
  return (
    <AdminToolbar embedded={props.embedded}>
      {props.onSearchChange ? (
        <div className="admin-search-field">
          <Search aria-hidden="true" size={16} />
          <input
            className="admin-input"
            aria-label={props.searchLabel ?? props.searchPlaceholder ?? 'Buscar'}
            placeholder={props.searchPlaceholder ?? 'Buscar...'}
            value={props.searchValue ?? ''}
            onChange={(event) => props.onSearchChange?.(event.target.value)}
          />
        </div>
      ) : null}
      {props.filters}
      {props.primaryAction || props.secondaryActions ? (
        <div className="admin-toolbar__actions">
          {props.primaryAction}
          {props.secondaryActions}
        </div>
      ) : null}
    </AdminToolbar>
  );
}

export function AdminModuleSurface(props: { children: ReactNode; className?: string }) {
  return <section className={`admin-module-surface${props.className ? ` ${props.className}` : ''}`}>{props.children}</section>;
}
