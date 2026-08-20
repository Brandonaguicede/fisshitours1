import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import type { StorageImage } from '../../services/imageService';

interface DestinationRow {
  id: string;
  name: string;
  region: string | null;
  image_url: string | null;
  image_public_id: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `destino-${Date.now()}`;
}

export default function AdminDestinationsPage() {
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [editing, setEditing] = useState<DestinationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadDestinations() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('destinations')
      .select('id, name, region, image_url, image_public_id, description, active, sort_order')
      .order('sort_order');
    setLoading(false);
    if (error) {
      setError(error.message);
      setDestinations([]);
      return;
    }
    setDestinations((data ?? []) as DestinationRow[]);
  }

  useEffect(() => {
    void loadDestinations();
  }, []);

  async function createDestination() {
    const id = `destino-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await supabase
      .from('destinations')
      .insert({ id, name: 'Nuevo destino', active: true, sort_order: destinations.length + 1 })
      .select('id, name, region, image_url, image_public_id, description, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(data as DestinationRow);
    await loadDestinations();
  }

  async function saveDestination() {
    if (!editing) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('destinations')
      .update({
        id: editing.id || slugify(editing.name),
        name: editing.name,
        region: editing.region,
        description: editing.description,
        active: editing.active,
        sort_order: editing.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Destino actualizado.');
    await loadDestinations();
  }

  async function onImageSaved(image: StorageImage) {
    if (!editing) return;
    const { error } = await supabase
      .from('destinations')
      .update({ image_url: image.public_url, image_public_id: image.storage_path, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) throw new Error(error.message);
    setEditing({ ...editing, image_url: image.public_url, image_public_id: image.storage_path });
    await loadDestinations();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Destinos" description="Lugares y regiones mostrados en la pagina publica." actions={<button className="admin-btn" type="button" onClick={() => void createDestination()}><Plus size={16} /> Crear destino</button>} />
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
      {loading ? (
        <p className="admin-muted">Cargando destinos...</p>
      ) : (
        <AdminTable headers={['Destino', 'Region', 'Descripcion', 'Orden', 'Estado', 'Acciones']}>
          {destinations.map((destination) => (
            <tr key={destination.id}>
              <td>{destination.name}<div className="admin-muted">{destination.id}</div></td>
              <td>{destination.region ?? '-'}</td>
              <td>{destination.description ?? '-'}</td>
              <td>{destination.sort_order}</td>
              <td><AdminBadge value={destination.active} /></td>
              <td><button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(destination)}><Pencil size={14} /> Editar</button></td>
            </tr>
          ))}
          {destinations.length === 0 ? <tr><td colSpan={6} className="admin-muted">No hay destinos registrados.</td></tr> : null}
        </AdminTable>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} titleId="destination-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="rounded-2xl border border-white/60 bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="destination-edit-title" className="admin-card__title"><Pencil size={18} /> Editar destino</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="mt-4 grid gap-4">
              <AdminImageManager
                resourceTable="destinations"
                resourceId={editing.id}
                folder="destinations"
                currentImageUrl={editing.image_url}
                currentStoragePath={editing.image_public_id}
                label={editing.name}
                aspect={4 / 5}
                maxWidth={1200}
                maxHeight={1500}
                maxSizeMB={0.6}
                requireReplacementToDelete
                onImageSaved={onImageSaved}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1"><span className="admin-muted">Nombre</span><input className="admin-input" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Region</span><input className="admin-input" value={editing.region ?? ''} onChange={(event) => setEditing({ ...editing, region: event.target.value || null })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Orden</span><input className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} /></label>
              </div>
              <label className="grid gap-1"><span className="admin-muted">Descripcion</span><textarea className="admin-input" value={editing.description ?? ''} onChange={(event) => setEditing({ ...editing, description: event.target.value || null })} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span className="admin-muted">Activo</span></label>
              <div className="admin-image-manager__actions">
                <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveDestination()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
