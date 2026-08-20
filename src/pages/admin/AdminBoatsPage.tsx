import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
import type { StorageImage } from '../../services/imageService';
import { money } from './adminMockData';

interface BoatRow {
  id: string;
  slug: string;
  name: string;
  images: string[];
  length: string | null;
  engine: string | null;
  included_guests: number;
  max_guests: number;
  extra_guest_price: number;
  image_url: string | null;
  image_public_id: string | null;
  active: boolean;
  sort_order: number;
}

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

export default function AdminBoatsPage() {
  const [boats, setBoats] = useState<BoatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<BoatRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadBoats() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('boats')
      .select('id, slug, name, images, length, engine, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
      .order('sort_order', { ascending: true });

    setLoading(false);
    if (error) {
      setBoats([]);
      setError(error.message);
      return;
    }
    setBoats(((data ?? []) as BoatRow[]).map((boat) => ({ ...boat, images: Array.isArray(boat.images) ? boat.images : [] })));
  }

  useEffect(() => {
    void loadBoats();
  }, []);

  async function createBoat() {
    setNotice('');
    setError('');
    const slug = `nuevo-bote-${Date.now()}`;
    const { data, error } = await supabase
      .from('boats')
      .insert({
        id: slug,
        slug,
        name: 'Nuevo bote',
        included_guests: 1,
        max_guests: 6,
        extra_guest_price: 0,
        active: true,
        sort_order: (boats?.length ?? 0) + 1,
      })
      .select('id, slug, name, images, length, engine, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(data as BoatRow);
    await loadBoats();
  }

  async function closeEditor() {
    setEditing(null);
  }

  async function saveEditor() {
    if (!editing) return;
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('boats')
      .update({
        name: editing.name,
        slug: editing.slug,
        images: editing.images,
        length: editing.length,
        engine: editing.engine,
        included_guests: editing.included_guests,
        max_guests: editing.max_guests,
        extra_guest_price: editing.extra_guest_price,
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
    setNotice('Bote actualizado.');
    await loadBoats();
  }

  async function onImageSaved(image: StorageImage) {
    const { error } = await supabase
      .from('boats')
      .update({ image_url: image.public_url, image_public_id: image.storage_path, updated_at: new Date().toISOString() })
      .eq('id', editing!.id);
    if (error) throw new Error(error.message);
    setEditing((current) => (current ? { ...current, image_url: image.public_url, image_public_id: image.storage_path } : current));
    await loadBoats();
  }

  async function onImageDeleted(storagePath: string) {
    const { error } = await supabase
      .from('boats')
      .update({ image_url: null, image_public_id: null, updated_at: new Date().toISOString() })
      .eq('id', editing!.id)
      .eq('image_public_id', storagePath);
    if (error) throw new Error(error.message);
    setEditing((current) => (current ? { ...current, image_url: null, image_public_id: null } : current));
    await loadBoats();
  }

  async function onGalleryImageSaved(image: StorageImage) {
    if (!editing) return;
    const nextImages = [...editing.images, image.public_url];
    const { error } = await supabase
      .from('boats')
      .update({ images: nextImages, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) throw new Error(error.message);
    setEditing({ ...editing, images: nextImages });
    await loadBoats();
  }

  async function setGalleryImageAsMain(imageUrl: string) {
    if (!editing) return;
    const { error } = await supabase
      .from('boats')
      .update({ image_url: imageUrl, image_public_id: null, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing({ ...editing, image_url: imageUrl, image_public_id: null });
    await loadBoats();
  }

  async function removeGalleryImage(imageUrl: string) {
    if (!editing) return;
    if (!window.confirm('Eliminar esta imagen adicional del bote?')) return;
    const nextImages = editing.images.filter((item) => item !== imageUrl);
    const storagePath = imageUrl.includes('/site-images/') ? imageUrl.split('/site-images/')[1] : null;
    if (storagePath) await deleteStorageImage({ storagePath, resourceTable: 'boats', resourceId: editing.id });
    const { error } = await supabase
      .from('boats')
      .update({ images: nextImages, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing({ ...editing, images: nextImages });
    await loadBoats();
  }

  async function moveGalleryImage(index: number, direction: -1 | 1) {
    if (!editing) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= editing.images.length) return;
    const nextImages = [...editing.images];
    [nextImages[index], nextImages[nextIndex]] = [nextImages[nextIndex], nextImages[index]];
    const { error } = await supabase
      .from('boats')
      .update({ images: nextImages, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing({ ...editing, images: nextImages });
    await loadBoats();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Botes" description="Flota disponible para paquetes reservables." actions={<button className="admin-btn" type="button" onClick={() => void createBoat()}><Plus size={16} /> Crear bote</button>} />

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a la flota: se requiere una sesión de admin/editor en Supabase.'
            : error}
        </div>
      ) : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando botes...</p>
      ) : (
        <AdminTable headers={['Bote', 'Capacidad', 'Motor', 'Precio extra', 'Estado', 'Acciones']}>
          {(boats ?? []).map((boat) => (
            <tr key={boat.id}>
              <td>{boat.name}<div className="admin-muted">{boat.length ?? '-'}</div></td>
              <td>{boat.included_guests} incluidos / {boat.max_guests} max</td>
              <td>{boat.engine ?? '-'}</td>
              <td>{money(boat.extra_guest_price)}</td>
              <td><AdminBadge value={boat.active} /></td>
              <td>
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(boat)}><Pencil size={14} /> Editar</button>
              </td>
            </tr>
          ))}
          {(boats ?? []).length === 0 ? (
            <tr>
              <td colSpan={6} className="admin-muted">No hay botes registrados.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="boat-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="rounded-2xl border border-white/60 bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="boat-edit-title" className="admin-card__title"><Pencil size={18} /> Editar bote</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => void closeEditor()}><X size={18} /></button>
            </div>
            <div className="mt-4 grid gap-4">
              <AdminImageManager
                resourceTable="boats"
                resourceId={editing.id}
                folder="boats"
                currentImageUrl={editing.image_url}
                currentStoragePath={editing.image_public_id}
                label={editing.name}
                aspect={16 / 9}
                requireReplacementToDelete
                onImageSaved={onImageSaved}
                onImageDeleted={onImageDeleted}
              />
              <section className="admin-card">
                <h3 className="admin-card__title"><ImagePlus size={18} /> Galeria adicional del bote</h3>
                <AdminImageManager
                  resourceTable="boats"
                  resourceId={editing.id}
                  folder="boats"
                  label={`${editing.name} galeria`}
                  aspect={16 / 10}
                  maxWidth={1600}
                  maxHeight={1000}
                  maxSizeMB={0.6}
                  onImageSaved={onGalleryImageSaved}
                />
                <div className="mt-4 grid gap-3">
                  {editing.images.map((image, index) => (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2" key={`${image}-${index}`}>
                      <img className="h-16 w-24 rounded-lg object-cover" src={image} alt="" loading="lazy" decoding="async" />
                      <span className="min-w-0 flex-1 truncate text-sm">{image}</span>
                      <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void setGalleryImageAsMain(image)}><Star size={14} /> Principal</button>
                      <button className="admin-icon-btn" type="button" aria-label="Subir orden" onClick={() => void moveGalleryImage(index, -1)}><ArrowUp size={15} /></button>
                      <button className="admin-icon-btn" type="button" aria-label="Bajar orden" onClick={() => void moveGalleryImage(index, 1)}><ArrowDown size={15} /></button>
                      <button className="admin-icon-btn" type="button" aria-label="Eliminar imagen adicional" onClick={() => void removeGalleryImage(image)}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  {editing.images.length === 0 ? <p className="admin-muted">No hay imagenes adicionales.</p> : null}
                </div>
              </section>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="admin-muted">Nombre</span>
                  <input className="admin-input" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Slug</span>
                  <input className="admin-input" value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Dimensiones</span>
                  <input className="admin-input" value={editing.length ?? ''} onChange={(event) => setEditing({ ...editing, length: event.target.value || null })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Motor</span>
                  <input className="admin-input" value={editing.engine ?? ''} onChange={(event) => setEditing({ ...editing, engine: event.target.value || null })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Incluidos</span>
                  <input className="admin-input" type="number" min={0} value={editing.included_guests} onChange={(event) => setEditing({ ...editing, included_guests: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Maximo</span>
                  <input className="admin-input" type="number" min={1} value={editing.max_guests} onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Precio extra (USD)</span>
                  <input className="admin-input" type="number" min={0} value={editing.extra_guest_price} onChange={(event) => setEditing({ ...editing, extra_guest_price: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Orden</span>
                  <input className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} />
                <span className="admin-muted">Bote activo</span>
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
