import { ArrowUpDown, Check, ChevronDown, ChevronUp, Filter, GripVertical, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
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

/**
 * Shared icon-only button. `label` is required and becomes both `aria-label`
 * and (unless overridden) `title`, so an icon-only control can never ship
 * without an accessible name or hover hint. Hit target and focus-visible ring
 * come from the `.admin-icon-btn` tokens in admin.css (grow on touch).
 */
export function AdminIconButton({
  icon: Icon,
  label,
  title,
  size = 'md',
  bordered = false,
  iconSize,
  className,
  type = 'button',
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  title?: string;
  size?: 'sm' | 'md';
  bordered?: boolean;
  iconSize?: number;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>) {
  const classes = ['admin-icon-btn', size === 'sm' ? 'admin-icon-btn--sm' : '', bordered ? 'admin-icon-btn--bordered' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={classes} aria-label={label} title={title ?? label}>
      <Icon size={iconSize ?? (size === 'sm' ? 15 : 18)} aria-hidden="true" />
    </button>
  );
}

export function AdminStatCard(props: { label: string; value: string; icon: LucideIcon; tone?: 'ocean' | 'success' | 'warning' | 'danger' }) {
  return (
    <article className={`admin-stat-card admin-stat-card--${props.tone ?? 'ocean'}`}>
      <div className="admin-stat-card__head">
        <p className="admin-stat-card__label">{props.label}</p>
        <span className="admin-stat-card__icon" aria-hidden="true"><props.icon size={14} /></span>
      </div>
      <strong className="admin-stat-card__value">{props.value}</strong>
    </article>
  );
}

/**
 * `value` decides the tone; `label` (optional, display only) replaces the
 * visible text — lets a screen show a friendly Spanish label without
 * changing the underlying value the color is derived from.
 */
export function AdminBadge({ value, label }: { value: string | boolean; label?: string }) {
  const text = label ?? (typeof value === 'boolean' ? (value ? 'Activo' : 'Inactivo') : value.split('_').join(' '));
  const normalized = String(value).toLowerCase();
  const tone =
    normalized.includes('paid') || normalized.includes('confirmed') || normalized === 'true' || normalized.includes('approved')
        ? 'success'
        : normalized.includes('pending') || normalized.includes('requested') || normalized.includes('day') || normalized.includes('draft') || normalized.includes('borrador')
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
  /** Renders the trigger as a square icon-only button (label stays as aria-label/title). */
  iconOnly?: boolean;
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
      <button
        ref={triggerRef}
        className={`admin-btn admin-btn--secondary admin-filter-trigger${props.iconOnly ? ' admin-btn--icon-only admin-filter-trigger--icon-only' : ''}`}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={props.iconOnly ? (props.activeCount ? `${props.label ?? 'Filtros'} (${props.activeCount} activos)` : (props.label ?? 'Filtros')) : undefined}
        title={props.iconOnly ? (props.label ?? 'Filtros') : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Filter size={16} aria-hidden="true" />
        {props.iconOnly ? null : <span>{props.label ?? 'Filtros'}</span>}
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
              <AdminIconButton icon={X} iconSize={17} label="Cerrar filtros" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} />
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

/**
 * Toolbar control for `useAdminReorder` (see src/hooks/useAdminReorder.ts).
 * Normal mode shows a single "Reordenar" button; reorder mode swaps it for
 * Cancelar/Guardar orden. `disabledReason` (e.g. "Limpia la búsqueda para
 * reordenar") both disables and explains why reordering isn't available —
 * reordering while a search/filter hides rows would silently misnumber
 * whatever isn't currently visible.
 */
export function AdminReorderToolbar(props: {
  reordering: boolean;
  saving?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  disabledReason?: string;
  /** Icon-only controls (Reordenar / Cancelar / Guardar orden keep aria-label + title). */
  iconOnly?: boolean;
}) {
  const iconClass = props.iconOnly ? ' admin-btn--icon-only' : '';
  if (!props.reordering) {
    return (
      <button
        className={`admin-btn admin-btn--secondary${iconClass}`}
        type="button"
        onClick={props.onStart}
        disabled={Boolean(props.disabledReason)}
        aria-label={props.iconOnly ? 'Reordenar' : undefined}
        title={props.disabledReason ?? (props.iconOnly ? 'Reordenar' : undefined)}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
        {props.iconOnly ? null : ' Reordenar'}
      </button>
    );
  }
  const saveLabel = props.saving ? 'Guardando...' : 'Guardar orden';
  return (
    <div className="admin-toolbar__actions">
      <button className={`admin-btn admin-btn--secondary${iconClass}`} type="button" onClick={props.onCancel} disabled={props.saving} aria-label={props.iconOnly ? 'Cancelar' : undefined} title={props.iconOnly ? 'Cancelar' : undefined}>
        {props.iconOnly ? <X size={16} aria-hidden="true" /> : 'Cancelar'}
      </button>
      <button className={`admin-btn${iconClass}`} type="button" onClick={props.onSave} disabled={props.saving} aria-label={props.iconOnly ? saveLabel : undefined} title={props.iconOnly ? saveLabel : undefined}>
        {props.iconOnly ? <Check size={16} aria-hidden="true" /> : saveLabel}
      </button>
    </div>
  );
}

/**
 * One row's drag handle + visible position number + Up/Down fallback
 * (keyboard/touch-friendly, doesn't require a successful native drag).
 * Renders only while `useAdminReorder` is in reorder mode.
 */
export function AdminReorderHandle(props: { position: number; total: number; dragging?: boolean; onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <div className={`admin-reorder-handle${props.dragging ? ' admin-reorder-handle--dragging' : ''}`}>
      <GripVertical size={16} aria-hidden="true" className="admin-reorder-handle__grip" />
      <span className="admin-reorder-handle__position">{props.position}</span>
      <div className="admin-reorder-handle__buttons">
        <AdminIconButton icon={ChevronUp} label="Subir" size="sm" iconSize={14} disabled={props.position === 1} onClick={props.onMoveUp} />
        <AdminIconButton icon={ChevronDown} label="Bajar" size="sm" iconSize={14} disabled={props.position === props.total} onClick={props.onMoveDown} />
      </div>
    </div>
  );
}
