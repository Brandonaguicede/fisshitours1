import { Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Modal } from '../common/Modal';

export interface AdminConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  titleId: string;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

// One shared destructive-action confirmation for the whole Admin. Click
// "Eliminar" → this opens → Cancelar does nothing → only the explicit
// confirm click fires the real delete. Every ad-hoc "Eliminar X" modal that
// used to hand-roll this same markup (Tours, Boats, Paquetes, Galería,
// Comentarios) now renders through this instead, so the pattern — and any
// future fix to it — lives in one place.
export function AdminConfirmDialog({ open, onClose, onConfirm, titleId, title, message, confirmLabel = 'Eliminar', cancelLabel = 'Cancelar', loading = false }: AdminConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} titleId={titleId} className="max-w-md">
      <div className="admin-modal-card">
        <h2 id={titleId} className="admin-card__title"><Trash2 size={18} /> {title}</h2>
        <div className="admin-muted mt-2">{message}</div>
        <div className="admin-actions mt-5">
          <button className="admin-btn admin-btn--secondary" type="button" disabled={loading} onClick={onClose}>{cancelLabel}</button>
          <button className="admin-btn admin-btn--danger" type="button" disabled={loading} onClick={() => void onConfirm()}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AdminConfirmDialog;
