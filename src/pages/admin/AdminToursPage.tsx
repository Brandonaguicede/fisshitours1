import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import type { StorageImage } from '../../services/imageService';

interface TourRow {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
  image_public_id: string | null;
  category: string;
  rating: number;
  active: boolean;
  sort_order: number;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `tour-${Date.now()}`;
}

export default function AdminToursPage() {
  const [tours, setTours] = useState<TourRow[]>([]);
  const [editing, setEditing] = useState<TourRow | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadTours() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('tours')
      .select('id, title, slug, location, description, image_url, image_public_id, category, rating, active, sort_order')
      .order('sort_order');
    setLoading(false);
    if (error) {
      setError(error.message);
      setTours([]);
      return;
    }
    setTours((data ?? []) as TourRow[]);
  }

  useEffect(() => {
    void loadTours();
  }, []);

  async function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await supabase
      .from('tours')
      .insert({
        id,
        title: 'Nuevo tour',
        slug: id,
        category: 'Fishing',
        rating: 5,
        active: true,
        sort_order: tours.length + 1,
      })
      .select('id, title, slug, location, description, image_url, image_public_id, category, rating, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(data as TourRow);
    await loadTours();
  }

  async function saveTour() {
    if (!editing) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('tours')
      .update({
        title: editing.title,
        slug: editing.slug || slugify(editing.title),
        location: editing.location,
        description: editing.description,
        category: editing.category,
        rating: editing.rating,
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
    setNotice('Tour actualizado.');
    await loadTours();
  }

  async function onImageSaved(image: StorageImage) {
    if (!editing) return;
    const { error } = await supabase
      .from('tours')
      .update({ image_url: image.public_url, image_public_id: image.storage_path, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) throw new Error(error.message);
    setEditing({ ...editing, image_url: image.public_url, image_public_id: image.storage_path });
    await loadTours();
  }

  const visibleTours = tours.filter((tour) => !search || tour.title.toLowerCase().includes(search.toLowerCase()) || tour.slug.includes(search.toLowerCase()));

  return (
    <div className="admin-page">
      <AdminPageHeader title="Tours" description="Tours generales visibles en la pagina publica." actions={<button className="admin-btn" type="button" onClick={() => void createTour()}><Plus size={16} /> Crear tour</button>} />
      <AdminToolbar>
        <input className="admin-input" placeholder="Buscar tour" value={search} onChange={(event) => setSearch(event.target.value)} />
      </AdminToolbar>
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
      {loading ? (
        <p className="admin-muted">Cargando tours...</p>
      ) : (
        <AdminTable headers={['Tour', 'Categoria', 'Ubicacion', 'Rating', 'Orden', 'Estado', 'Acciones']}>
          {visibleTours.map((tour) => (
            <tr key={tour.id}>
              <td>{tour.title}<div className="admin-muted">{tour.slug}</div></td>
              <td>{tour.category}</td>
              <td>{tour.location ?? '-'}</td>
              <td>{tour.rating}</td>
              <td>{tour.sort_order}</td>
              <td><AdminBadge value={tour.active} /></td>
              <td><button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(tour)}><Pencil size={14} /> Editar</button></td>
            </tr>
          ))}
          {visibleTours.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay tours.</td></tr> : null}
        </AdminTable>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} titleId="tour-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="admin-modal-shell">
            <header className="admin-modal-header">
              <h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> Editar tour</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button>
            </header>
            <div className="admin-modal-body">
              {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
              {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}
              <AdminImageManager
                resourceTable="tours"
                resourceId={editing.id}
                folder="tours"
                currentImageUrl={editing.image_url}
                currentStoragePath={editing.image_public_id}
                label={editing.title}
                aspect={3 / 2}
                maxWidth={1200}
                maxHeight={800}
                maxSizeMB={0.35}
                requireReplacementToDelete
                onImageSaved={onImageSaved}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1"><span className="admin-muted">Titulo</span><input className="admin-input" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Slug</span><input className="admin-input" value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: slugify(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Categoria</span><input className="admin-input" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Ubicacion</span><input className="admin-input" value={editing.location ?? ''} onChange={(event) => setEditing({ ...editing, location: event.target.value || null })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Rating</span><input className="admin-input" type="number" min={0} max={5} step={0.1} value={editing.rating} onChange={(event) => setEditing({ ...editing, rating: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Orden</span><input className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} /></label>
              </div>
              <label className="grid gap-1"><span className="admin-muted">Descripcion</span><textarea className="admin-input" value={editing.description ?? ''} onChange={(event) => setEditing({ ...editing, description: event.target.value || null })} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span className="admin-muted">Activo</span></label>
            </div>
            <ModalFooter>
              <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditing(null)}>Cerrar</button>
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveTour()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
