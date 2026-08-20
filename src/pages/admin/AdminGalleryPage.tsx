import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
import type { StorageImage } from '../../services/imageService';

interface GalleryRow {
  id: string;
  src: string | null;
  image_url: string | null;
  image_public_id: string | null;
  alt: string;
  category: string;
  title: string | null;
  active: boolean;
  sort_order: number;
}

const CATEGORY_OPTIONS = ['fishing', 'experiences', 'boats', 'wildlife', 'beach'];

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryRow[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<GalleryRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadImages() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('gallery_images')
      .select('id, src, image_url, image_public_id, alt, category, title, active, sort_order')
      .order('sort_order', { ascending: true });

    setLoading(false);
    if (error) {
      setImages([]);
      setError(error.message);
      return;
    }
    setImages((data ?? []) as GalleryRow[]);
  }

  useEffect(() => {
    void loadImages();
  }, []);

  async function createImage() {
    setNotice('');
    setError('');
    const { data, error } = await supabase
      .from('gallery_images')
      .insert({ id: `gal-${crypto.randomUUID()}`, alt: 'Nueva imagen', category: 'fishing', active: true, sort_order: (images?.length ?? 0) + 1 })
      .select('id, src, image_url, image_public_id, alt, category, title, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(data as GalleryRow);
    await loadImages();
  }

  async function closeEditor() {
    if (editing && !editing.src && !editing.image_url) {
      await supabase.from('gallery_images').delete().eq('id', editing.id);
    }
    setEditing(null);
  }

  async function saveEditor() {
    if (!editing) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('gallery_images')
      .update({ alt: editing.alt, category: editing.category, title: editing.title, active: editing.active, sort_order: editing.sort_order })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Cambios de galería guardados.');
    await loadImages();
  }

  async function onImageSaved(image: StorageImage) {
    const { error } = await supabase
      .from('gallery_images')
      .update({ src: image.public_url, image_url: image.public_url, image_public_id: image.storage_path, updated_at: new Date().toISOString() })
      .eq('id', editing!.id);
    if (error) throw new Error(error.message);
    setEditing((current) => (current ? { ...current, src: image.public_url, image_url: image.public_url, image_public_id: image.storage_path } : current));
    await loadImages();
  }

  async function onImageDeleted(storagePath: string) {
    const { error } = await supabase
      .from('gallery_images')
      .update({ src: null, image_url: null, image_public_id: null, updated_at: new Date().toISOString() })
      .eq('id', editing!.id)
      .eq('image_public_id', storagePath);
    if (error) throw new Error(error.message);
    setEditing((current) => (current ? { ...current, src: null, image_url: null, image_public_id: null } : current));
    await loadImages();
  }

  async function deleteRow(row: GalleryRow) {
    if (!window.confirm(`¿Eliminar la imagen "${row.alt}" de la galería?`)) return;
    if (row.image_public_id) {
      await deleteStorageImage({ storagePath: row.image_public_id, resourceTable: 'gallery_images', resourceId: row.id });
    }
    const { error } = await supabase.from('gallery_images').delete().eq('id', row.id);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Imagen eliminada de la galería.');
    await loadImages();
  }

  const categories = useMemo(() => {
    const set = new Set<string>(CATEGORY_OPTIONS);
    (images ?? []).forEach((image) => set.add(image.category));
    return Array.from(set);
  }, [images]);

  const visibleImages = (images ?? []).filter(
    (image) =>
      (filter === 'all' || image.category === filter) &&
      (!search || image.alt.toLowerCase().includes(search.toLowerCase()) || (image.title ?? '').toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="admin-page">
      <AdminPageHeader title="Galeria" description="Imagenes publicas gestionadas con Supabase Storage." actions={<button className="admin-btn" type="button" onClick={() => void createImage()}><Plus size={16} /> Nueva imagen</button>} />

      <AdminToolbar>
        <select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todas las categorias</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <input className="admin-input" placeholder="Buscar por alt o titulo" value={search} onChange={(event) => setSearch(event.target.value)} />
      </AdminToolbar>

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a la galería: se requiere una sesión de admin/editor en Supabase.'
            : error}
        </div>
      ) : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando galería...</p>
      ) : (
        <section className="admin-media-grid">
          {visibleImages.map((image) => (
            <article className="admin-media-card" key={image.id}>
              <img src={image.src ?? image.image_url ?? '/galeria/IMG_1088.jpeg'} alt={image.alt} loading="lazy" decoding="async" width={1600} height={1200} />
              <div className="admin-media-card__body">
                <strong>{image.category}</strong>
                <span className="admin-muted">{image.alt}</span>
                <div className="admin-actions">
                  <AdminBadge value={image.active} />
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(image)}><Pencil size={14} /> Editar</button>
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void deleteRow(image)}><Trash2 size={14} /></button>
                </div>
              </div>
            </article>
          ))}
          {visibleImages.length === 0 ? (
            <div className="admin-empty">No hay imágenes en este estado.</div>
          ) : null}
        </section>
      )}

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="gallery-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="rounded-2xl border border-white/60 bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="gallery-edit-title" className="admin-card__title"><Pencil size={18} /> Editar imagen</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => void closeEditor()}><X size={18} /></button>
            </div>
            <div className="mt-4 grid gap-4">
              <AdminImageManager
                resourceTable="gallery_images"
                resourceId={editing.id}
                folder="gallery"
                currentImageUrl={editing.src ?? editing.image_url}
                currentStoragePath={editing.image_public_id}
                label={editing.alt}
                aspect={4 / 3}
                onImageSaved={onImageSaved}
                onImageDeleted={onImageDeleted}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="admin-muted">Titulo</span>
                  <input className="admin-input" value={editing.title ?? ''} onChange={(event) => setEditing({ ...editing, title: event.target.value || null })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Alt</span>
                  <input className="admin-input" value={editing.alt} onChange={(event) => setEditing({ ...editing, alt: event.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Categoria</span>
                  <select className="admin-select" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Orden</span>
                  <input className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />
                <span className="admin-muted">Visible en el sitio</span>
              </label>
              <div className="admin-image-manager__actions">
                <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveEditor()}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void closeEditor()}>Cerrar</button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
