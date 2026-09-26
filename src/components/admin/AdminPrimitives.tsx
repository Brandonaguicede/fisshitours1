import { ArrowUpDown, ChevronDown, ChevronUp, Eye, EyeOff, Filter, GripVertical, Loader2, Plus, Search, X } from 'lucide-react';
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

/**
 * The "create" action of every main listing: the primary button, icon-only (+). `label` is required and becomes the aria-label
 * and the hover title ("Crear bote", "Nueva imagen"…), so it never ships without an accessible name; hit target and focus ring
 * come from the shared `.admin-btn` tokens.
 */
export function AdminCreateButton({ label, className, type = 'button', ...rest }: { label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>) {
  return (
    <button {...rest} type={type} className={['admin-btn', 'admin-btn--icon', 'admin-create-btn', className ?? ''].filter(Boolean).join(' ')} aria-label={label} title={label}>
      <Plus size={18} aria-hidden="true" />
    </button>
  );
}

/**
 * The one visibility control of the Admin. It shows the CURRENT state — "Visible" with the open eye, "No visible" with the crossed
 * eye — never the action it will trigger. `actionLabel` (e.g. "Ocultar imagen") only feeds the accessible name, which keeps the
 * visible words in front ("Visible. Ocultar imagen"), so screen readers still learn what pressing does.
 */
export function AdminVisibilityButton({ visible, actionLabel, busy, className, ...rest }: { visible: boolean; actionLabel: string; busy?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>) {
  const text = visible ? 'Visible' : 'No visible';
  return (
    <button {...rest} type={rest.type ?? 'button'} className={['admin-btn', visible ? 'admin-btn--secondary' : '', 'admin-visibility-btn', className ?? ''].filter(Boolean).join(' ')} aria-label={`${text}. ${actionLabel}`} title={actionLabel} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : visible ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
      {text}
    </button>
  );
}

/**
 * The round avatar of a person in a listing: their photo, or the initial on a soft circle. A fixed square that never shrinks or
 * stretches with the row (so it is always a circle, whatever the name length or the row height), with the initial centered both ways.
 */
export function AdminAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return imageUrl ? (
    <img className="admin-avatar" src={imageUrl} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="admin-avatar admin-avatar--initial" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '?'}</span>
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

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * The one status vocabulary of the Admin: every state the panel shows is spelled and coloured here, in Spanish, so the same
 * state never reads two ways ("Activo" vs "active") or looks two ways. Keys are the stored values (or booleans) — nothing is
 * renamed in the database, this is presentation only. `hidden_f` is the feminine form for things like "Imagen".
 */
export const ADMIN_STATUS_BADGES: Record<string, { label: string; tone: BadgeTone }> = {
  true: { label: 'Activo', tone: 'success' },
  active: { label: 'Activo', tone: 'success' },
  published: { label: 'Activo', tone: 'success' },
  false: { label: 'Inactivo', tone: 'neutral' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
  visible: { label: 'Visible', tone: 'success' },
  hidden: { label: 'Oculto', tone: 'neutral' },
  hidden_f: { label: 'Oculta', tone: 'neutral' },
  draft: { label: 'Borrador', tone: 'warning' },
  pending: { label: 'Pendiente', tone: 'warning' },
  processing: { label: 'Procesando', tone: 'warning' },
  requested: { label: 'Solicitada', tone: 'warning' },
  pending_payment: { label: 'Pago pendiente', tone: 'warning' },
  pending_confirmation: { label: 'Por confirmar', tone: 'warning' },
  not_required_yet: { label: 'Pago en tour', tone: 'neutral' },
  approved: { label: 'Aprobado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  paid: { label: 'Pagado', tone: 'success' },
  failed: { label: 'Fallido', tone: 'danger' },
  refunded: { label: 'Reembolsado', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
  completed: { label: 'Completada', tone: 'neutral' },
};

/** Shared Spanish label for a stored status value; unknown values are humanized, never shown as raw codes. */
export function adminStatusLabel(value: string | boolean) {
  const known = ADMIN_STATUS_BADGES[String(value).trim().toLowerCase()];
  if (known) return known.label;
  const text = String(value).split('_').join(' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * `value` is the stored status (or a boolean) and decides both the Spanish text and the tone through ADMIN_STATUS_BADGES.
 * Values outside that vocabulary (a counter, a one-off tag such as "Portada") are shown as given, neutral. `label` only
 * applies to those: it can never re-spell a known status.
 */
export function AdminBadge({ value, label }: { value: string | boolean; label?: string }) {
  const known = ADMIN_STATUS_BADGES[String(value).trim().toLowerCase()];
  const text = known?.label ?? label ?? adminStatusLabel(value);
  return <span className={`admin-badge admin-badge--${known?.tone ?? 'neutral'}`}>{text}</span>;
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
 * The trigger is always a funnel icon (no visible button border, `--admin-hit-target` sized); its name lives
 * in aria-label/title and the active-filter count is appended to the accessible name and shown as a badge.
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
      <button
        ref={triggerRef}
        className="admin-icon-btn admin-filter-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={props.activeCount ? `${props.label ?? 'Filtros'} (${props.activeCount} activos)` : (props.label ?? 'Filtros')}
        title={props.label ?? 'Filtros'}
        onClick={() => setOpen((value) => !value)}
      >
        <Filter size={18} aria-hidden="true" />
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
              <button className="admin-btn" type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Listo</button>
              {props.onReset ? <button className="admin-btn admin-btn--ghost" type="button" disabled={!props.activeCount} onClick={props.onReset}>Limpiar</button> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Shared toolbar so every admin listing uses the same layout instead of each screen inventing its own. The order is fixed —
 * 1. search, 2. primary action, 3. filter, 4. reorder, 5. download — in the DOM (Tab order) and visually, never through CSS
 * `order`; only the controls a screen really has are rendered. Pass
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
  /** Icon-level extras that come last, after filter and reorder — e.g. the download menu. */
  secondaryActions?: ReactNode;
  /** `useAdminReorder` wiring: adds the icon-only "Reordenar" after the filter; while reordering, "Guardar orden" takes the primary slot. */
  reorder?: AdminReorderProps;
  embedded?: boolean;
}) {
  const reordering = Boolean(props.reorder?.reordering);
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
      {reordering && props.reorder ? <AdminReorderActions {...props.reorder} /> : props.primaryAction}
      {props.filters}
      {!reordering && (props.reorder || props.secondaryActions) ? (
        <div className="admin-toolbar__actions">
          {props.reorder ? <AdminReorderStart {...props.reorder} /> : null}
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
 * Normal mode shows a single icon-only "Reordenar" button (aria-label + title, same hit target and focus
 * ring as every icon control); reorder mode swaps it for the primary "Guardar orden" followed by the
 * secondary "Cancelar" (primary first, in the DOM and visually). `disabledReason` (e.g. "Limpia la búsqueda
 * para reordenar") both disables and explains why reordering isn't available —
 * reordering while a search/filter hides rows would silently misnumber
 * whatever isn't currently visible.
 */
export interface AdminReorderProps {
  reordering: boolean;
  saving?: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  disabledReason?: string;
}

/** Normal mode: the icon-only "Reordenar" (aria-label + title, same hit target and focus ring as every icon control). */
export function AdminReorderStart(props: AdminReorderProps) {
  return (
    <AdminIconButton
      icon={ArrowUpDown}
      iconSize={18}
      label="Reordenar"
      title={props.disabledReason ?? 'Reordenar'}
      onClick={props.onStart}
      disabled={Boolean(props.disabledReason)}
    />
  );
}

/** Reorder mode: the primary "Guardar" (named "Guardar orden" for assistive tech) first, then the secondary "Cancelar". */
export function AdminReorderActions(props: AdminReorderProps) {
  return (
    <div className="admin-toolbar__actions">
      <button className="admin-btn" type="button" aria-label="Guardar orden" onClick={props.onSave} disabled={props.saving}>
        {props.saving ? 'Guardando...' : 'Guardar'}
      </button>
      <button className="admin-btn admin-btn--secondary" type="button" onClick={props.onCancel} disabled={props.saving}>Cancelar</button>
    </div>
  );
}

export function AdminReorderToolbar(props: AdminReorderProps) {
  return props.reordering ? <AdminReorderActions {...props} /> : <AdminReorderStart {...props} />;
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
