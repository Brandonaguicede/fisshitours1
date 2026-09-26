import { Pencil, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Modal } from '../common/Modal';
import { AdminMediaCard } from './AdminMediaKit';
import { AdminBadge } from './AdminPrimitives';

/**
 * Summary card for one image / video of Portada or Sobre Nosotros — the same "clean list, edit inside the editor" pattern as the
 * Galería: a thumbnail, the name, its state badge and the pencil. Replace / delete / URL live in the editor (AdminMediaAssetEditor).
 */
export function AdminMediaAssetCard(props: { label: string; kind: 'image' | 'video'; url: string; onEdit: () => void }) {
  const empty = props.kind === 'video' ? 'Sin video' : 'Sin imagen';
  return (
    <AdminMediaCard
      kind={props.kind}
      url={props.url}
      emptyText={empty}
      title={props.label}
      footer={(
        <>
          <AdminBadge value={props.url ? 'active' : 'empty'} label={empty} />
          <div className="admin-row-actions">
            <button className="admin-icon-action" type="button" title={`Editar ${props.label}`} aria-label={`Editar ${props.label}`} onClick={props.onEdit}><Pencil size={17} /></button>
          </div>
        </>
      )}
    />
  );
}

/** The editor of one asset: whatever manages it (image / video manager: replace, delete, R2 URL) lives here, not in the list. */
export function AdminMediaAssetEditor(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal open={props.open} onClose={props.onClose} titleId="media-asset-title" className="max-w-xl admin-media-asset-modal">
      <div className="admin-modal-shell">
        <header className="admin-modal-header">
          <h2 id="media-asset-title" className="admin-card__title"><Pencil size={18} /> Editar {props.title}</h2>
          <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={props.onClose}><X size={18} /></button>
        </header>
        <div className="admin-modal-body">{props.children}</div>
      </div>
    </Modal>
  );
}
