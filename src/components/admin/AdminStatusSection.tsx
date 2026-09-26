import { Settings, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import FormSection from './FormSection';
import { AdminBadge, AdminVisibilityButton } from './AdminPrimitives';

/**
 * The one "Estado y visibilidad" card of every Admin editor (Tours and Botes were the model): the current state as a badge with what
 * it means, one button that flips it (AdminVisibilityButton: "Visible" with Eye / "No visible" with EyeOff — it shows the CURRENT state), optional extra rows, and — when the item can be removed — the delete action inside the same card,
 * below a separator. Screens keep their own save/persistence: this only renders the control and calls back.
 */
export interface AdminStatusSectionProps {
  title?: string;
  description: string;
  active: boolean;
  /** What "visible" / "hidden" mean for this item, e.g. "Visible: aparece en la galería pública." */
  visibleHint: string;
  hiddenHint: string;
  /** Accessible names of the button (its visible text is always "Visible" / "No visible"): what pressing does, e.g. "Ocultar imagen" / "Mostrar imagen". */
  hideLabel: string;
  showLabel: string;
  onToggle: () => void;
  busy?: boolean;
  /** Extra rows (e.g. "Destacado"), rendered under the status row with the same layout. */
  children?: ReactNode;
  /** Present when the item can be deleted from this editor. */
  deleteAction?: { title: string; description: string; label: string; onDelete: () => void; disabled?: boolean };
}

export function AdminStatusRow(props: { label: string; badge?: ReactNode; hint: string; button: ReactNode }) {
  return (
    <>
      <div className="admin-tour-config-divider" role="separator" />
      <div className="admin-tour-config-row admin-tour-config-row--tour">
        <div className="admin-tour-config-row__status">
          <p className="admin-config-row__label">{props.label}</p>
          {props.badge}
          <p className="admin-muted">{props.hint}</p>
        </div>
        {props.button}
      </div>
    </>
  );
}

/** The destructive row of every Admin editor: red-tinted title + plain description on the left, the red button (trash icon + label) on the right. */
export function AdminDangerRow(props: { title: string; description: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="admin-tour-danger-row">
      <div>
        <strong>{props.title}</strong>
        <p className="admin-muted">{props.description}</p>
      </div>
      <button className="admin-btn admin-btn--danger" type="button" disabled={props.disabled} onClick={props.onClick}>
        <Trash2 size={15} /> {props.label}
      </button>
    </div>
  );
}

export default function AdminStatusSection(props: AdminStatusSectionProps) {
  return (
    <FormSection title={props.title ?? 'Estado y visibilidad'} description={props.description} icon={<Settings size={16} />}>
      <div className="admin-tour-config-row admin-tour-config-row--tour">
        <div className="admin-tour-config-row__status">
          <p className="admin-config-row__label">Estado actual</p>
          <AdminBadge value={props.active ? 'active' : 'inactive'} />
          <p className="admin-muted">{props.active ? props.visibleHint : props.hiddenHint}</p>
        </div>
        <AdminVisibilityButton visible={props.active} busy={props.busy} actionLabel={props.active ? props.hideLabel : props.showLabel} onClick={props.onToggle} />
      </div>
      {props.children}
      {props.deleteAction ? (
        <>
          <div className="admin-tour-config-divider" role="separator" />
          <AdminDangerRow title={props.deleteAction.title} description={props.deleteAction.description} label={props.deleteAction.label} disabled={props.deleteAction.disabled} onClick={props.deleteAction.onDelete} />
        </>
      ) : null}
    </FormSection>
  );
}
