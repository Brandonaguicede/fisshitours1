import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, ImagePlus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
import type { StorageImage } from '../../services/imageService';
import { money } from './adminMockData';

interface BoatImageRow {
  id: string;
  boat_id: string;
  image_url: string;
  storage_path: string | null;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  active: boolean;
  pending_deletion: boolean;
}

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
  boat_images?: BoatImageRow[];
}

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

function fallbackBoatImages(boat: BoatRow): BoatImageRow[] {
  const urls = Array.from(new Set([boat.image_url, ...(boat.images ?? [])].filter(Boolean))) as string[];
  return urls.map((url, index) => ({
    id: `legacy-${boat.id}-${index}`,
    boat_id: boat.id,
    image_url: url,
    storage_path: index === 0 ? boat.image_public_id : url.includes('/site-images/') ? url.split('/site-images/')[1] : null,
    alt_text: `${boat.name} ${index + 1}`,
    is_primary: index === 0,
    sort_order: index,
    active: true,
    pending_deletion: false,
  }));
}

export default function AdminBoatsPage() {
  const db = supabase as any;
  const [boats, setBoats] = useState<BoatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<BoatRow | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoatImageRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadBoats() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('boats')
      .select('id, slug, name, images, length, engine, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
      .order('sort_order', { ascending: true });

    if (error) {
      setLoading(false);
      setBoats([]);
      setError(error.message);
      return;
    }

    const rows = ((data ?? []) as BoatRow[]).map((boat) => ({ ...boat, images: Array.isArray(boat.images) ? boat.images : [] }));
    const boatIds = rows.map((boat) => boat.id);
    const imagesResult = boatIds.length
      ? await db
          .from('boat_images')
          .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
          .in('boat_id', boatIds)
          .eq('active', true)
          .order('sort_order', { ascending: true })
      : { data: [], error: null };

    const imagesByBoat = new Map<string, BoatImageRow[]>();
    if (!imagesResult.error) {
      for (const image of imagesResult.data ?? []) {
        const current = imagesByBoat.get(image.boat_id) ?? [];
        current.push(image as BoatImageRow);
        imagesByBoat.set(image.boat_id, current);
      }
    }

    setBoats(rows.map((boat) => ({ ...boat, boat_images: imagesByBoat.get(boat.id) ?? fallbackBoatImages(boat) })));
    setLoading(false);
  }

  useEffect(() => {
    void loadBoats();
  }, []);

  function openEditor(boat: BoatRow) {
    setEditing(boat);
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    setSelectedImageId((images.find((image) => image.is_primary) ?? images[0])?.id ?? null);
  }

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
        included_guests: 5,
        max_guests: 10,
        extra_guest_price: 65,
        active: true,
        sort_order: (boats?.length ?? 0) + 1,
      })
      .select('id, slug, name, images, length, engine, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    const row = { ...(data as BoatRow), images: [], boat_images: [] };
    setEditing(row);
    setSelectedImageId(null);
    await loadBoats();
  }

  async function closeEditor() {
    setEditing(null);
    setSelectedImageId(null);
    setPendingDelete(null);
  }

  async function syncBoatImageFields(boatId: string, images: BoatImageRow[]) {
    const activeImages = images.filter((image) => image.active).sort((a, b) => a.sort_order - b.sort_order);
    const primary = activeImages.find((image) => image.is_primary) ?? activeImages[0] ?? null;
    const { error } = await supabase
      .from('boats')
      .update({
        image_url: primary?.image_url ?? null,
        image_public_id: primary?.storage_path ?? null,
        images: activeImages.filter((image) => image.id !== primary?.id).map((image) => image.image_url),
        updated_at: new Date().toISOString(),
      })
      .eq('id', boatId);
    if (error) throw new Error(error.message);
  }

  async function refreshEditing(boatId = editing?.id) {
    await loadBoats();
    if (!boatId) return;
    const { data } = await supabase
      .from('boats')
      .select('id, slug, name, images, length, engine, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
      .eq('id', boatId)
      .single();
    if (!data) return;
    const imagesResult = await db
      .from('boat_images')
      .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
      .eq('boat_id', boatId)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    const rawBoat = data as unknown as BoatRow;
    const boat = {
      ...rawBoat,
      images: Array.isArray(rawBoat.images) ? rawBoat.images.filter((item): item is string => typeof item === 'string') : [],
      boat_images: (imagesResult.data ?? []) as BoatImageRow[],
    };
    setEditing(boat);
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    setSelectedImageId((current) => current ?? (images.find((image) => image.is_primary) ?? images[0])?.id ?? null);
  }

  async function saveEditor() {
    if (!editing) return;
    if (editing.included_guests < 1 || editing.max_guests < editing.included_guests || editing.extra_guest_price < 0) {
      setError('Revisa la capacidad: incluidos >= 1, maximo >= incluidos y precio adicional >= 0.');
      return;
    }
    if (editing.id === 'segundo-viento' && editing.max_guests > 10) {
      setError('Second Wind no puede superar 10 pasajeros.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('boats')
      .update({
        name: editing.name,
        slug: editing.slug,
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
    await refreshEditing(editing.id);
  }

  async function onGalleryImageSaved(image: StorageImage) {
    if (!editing) return;
    const currentImages = editing.boat_images ?? [];
    const shouldBePrimary = currentImages.length === 0;
    const { data, error } = await db
      .from('boat_images')
      .insert({
        boat_id: editing.id,
        image_url: image.public_url,
        storage_path: image.storage_path,
        alt_text: `${editing.name} image`,
        is_primary: shouldBePrimary,
        sort_order: currentImages.length,
        active: true,
      })
      .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
      .single();
    if (error) throw new Error(error.message);
    const nextImages = shouldBePrimary ? [data as BoatImageRow] : [...currentImages, data as BoatImageRow];
    await syncBoatImageFields(editing.id, nextImages);
    setSelectedImageId((data as BoatImageRow).id);
    await refreshEditing(editing.id);
  }

  async function setPrimaryImage(image: BoatImageRow) {
    if (!editing) return;
    setError('');
    const currentImages = editing.boat_images ?? [];
    await db.from('boat_images').update({ is_primary: false }).eq('boat_id', editing.id);
    const { error } = await db.from('boat_images').update({ is_primary: true, active: true }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }
    await syncBoatImageFields(editing.id, currentImages.map((item) => ({ ...item, is_primary: item.id === image.id })));
    setSelectedImageId(image.id);
    await refreshEditing(editing.id);
  }

  async function moveImage(image: BoatImageRow, direction: -1 | 1) {
    if (!editing) return;
    const images = [...(editing.boat_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const index = images.findIndex((item) => item.id === image.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    const updates = images.map((item, sort_order) => db.from('boat_images').update({ sort_order }).eq('id', item.id));
    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    await syncBoatImageFields(editing.id, images.map((item, sort_order) => ({ ...item, sort_order })));
    await refreshEditing(editing.id);
  }

  async function deleteBoatImage(image: BoatImageRow) {
    if (!editing) return;
    const currentImages = editing.boat_images ?? [];
    const remaining = currentImages.filter((item) => item.id !== image.id);
    if (image.is_primary && remaining.length > 0) {
      const replacement = remaining[0];
      await db.from('boat_images').update({ is_primary: true }).eq('id', replacement.id);
      replacement.is_primary = true;
    }

    const { error } = await db.from('boat_images').update({ active: false, pending_deletion: Boolean(image.storage_path) }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }

    if (image.storage_path) {
      try {
        await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'boat_images', resourceId: image.id });
        await db.from('boat_images').update({ pending_deletion: false }).eq('id', image.id);
      } catch {
        await db.from('boat_images').update({ pending_deletion: true, deletion_error: 'Storage delete failed' }).eq('id', image.id);
      }
    }

    await syncBoatImageFields(editing.id, remaining);
    setPendingDelete(null);
    setSelectedImageId((remaining.find((item) => item.is_primary) ?? remaining[0])?.id ?? null);
    setNotice('Imagen eliminada del bote.');
    await refreshEditing(editing.id);
  }

  async function copyUrl(url: string) {
    await navigator.clipboard?.writeText(url);
    setNotice('URL copiada.');
  }

  const editorImages = useMemo(() => (editing?.boat_images?.length ? editing.boat_images : editing ? fallbackBoatImages(editing) : []), [editing]);
  const selectedImage = editorImages.find((image) => image.id === selectedImageId) ?? editorImages.find((image) => image.is_primary) ?? editorImages[0] ?? null;

  return (
    <div className="admin-page">
      <AdminPageHeader title="Botes" description="Flota disponible para paquetes reservables." actions={<button className="admin-btn" type="button" onClick={() => void createBoat()}><Plus size={16} /> Crear bote</button>} />

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a la flota: se requiere una sesion de admin/editor en Supabase.'
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
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => openEditor(boat)}><Pencil size={14} /> Editar</button>
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

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="boat-edit-title" className="admin-boat-modal">
        {editing ? (
          <>
            <div className="admin-modal-header">
              <h2 id="boat-edit-title" className="admin-card__title"><Pencil size={18} /> Editar bote</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => void closeEditor()}><X size={18} /></button>
            </div>

            <div className="admin-modal-body">
              <section className="admin-boat-images">
                <div className="admin-boat-images__main">
                  {selectedImage ? (
                    <img src={selectedImage.image_url} alt={selectedImage.alt_text || editing.name} loading="eager" decoding="async" />
                  ) : (
                    <div className="admin-boat-images__empty"><ImagePlus size={28} /> Sin imagenes del bote</div>
                  )}
                  <span className="admin-boat-images__badge">Imagen principal</span>
                  {selectedImage && !selectedImage.is_primary ? (
                    <button className="admin-boat-images__primary admin-btn" type="button" onClick={() => void setPrimaryImage(selectedImage)}>
                      <Star size={14} /> Marcar principal
                    </button>
                  ) : null}
                  {editorImages.length > 1 ? (
                    <>
                      <button className="admin-boat-images__arrow admin-boat-images__arrow--prev" type="button" aria-label="Imagen anterior" onClick={() => setSelectedImageId(editorImages[(Math.max(editorImages.findIndex((image) => image.id === selectedImage?.id), 0) - 1 + editorImages.length) % editorImages.length].id)}><ArrowLeft size={18} /></button>
                      <button className="admin-boat-images__arrow admin-boat-images__arrow--next" type="button" aria-label="Imagen siguiente" onClick={() => setSelectedImageId(editorImages[(Math.max(editorImages.findIndex((image) => image.id === selectedImage?.id), 0) + 1) % editorImages.length].id)}><ArrowRight size={18} /></button>
                    </>
                  ) : null}
                </div>

                <div className="admin-boat-images__thumbs" role="list" aria-label="Imagenes del bote">
                  {editorImages.map((image, index) => (
                    <div className={`admin-boat-thumb${image.id === selectedImage?.id ? ' admin-boat-thumb--selected' : ''}`} key={image.id} role="listitem">
                      <button type="button" aria-label={`Ver imagen ${index + 1}`} onClick={() => setSelectedImageId(image.id)}>
                        <img src={image.image_url} alt="" loading="lazy" decoding="async" />
                      </button>
                      <div className="admin-boat-thumb__actions">
                        <button type="button" aria-label="Marcar como principal" onClick={() => void setPrimaryImage(image)}><Star size={14} /></button>
                        <button type="button" aria-label="Mover a la izquierda" onClick={() => void moveImage(image, -1)}><ArrowUp size={14} /></button>
                        <button type="button" aria-label="Mover a la derecha" onClick={() => void moveImage(image, 1)}><ArrowDown size={14} /></button>
                        <button type="button" aria-label="Copiar URL" title={image.image_url} onClick={() => void copyUrl(image.image_url)}><Copy size={14} /></button>
                        <button type="button" aria-label="Eliminar imagen" onClick={() => setPendingDelete(image)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <AdminImageManager
                  resourceTable="boats"
                  resourceId={editing.id}
                  folder="boats"
                  label={`${editing.name} galeria`}
                  aspect={16 / 9}
                  maxWidth={1600}
                  maxHeight={900}
                  maxSizeMB={0.6}
                  onImageSaved={onGalleryImageSaved}
                />
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
                  <span className="admin-muted">Eslora</span>
                  <input className="admin-input" value={editing.length ?? ''} onChange={(event) => setEditing({ ...editing, length: event.target.value || null })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Motor</span>
                  <input className="admin-input" value={editing.engine ?? ''} onChange={(event) => setEditing({ ...editing, engine: event.target.value || null })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Incluye hasta 5 personas</span>
                  <input className="admin-input" type="number" min={1} value={editing.included_guests} onChange={(event) => setEditing({ ...editing, included_guests: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Capacidad maxima</span>
                  <input className="admin-input" type="number" min={1} max={editing.id === 'segundo-viento' ? 10 : undefined} value={editing.max_guests} onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Precio por persona adicional (USD)</span>
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
            </div>

            <div className="admin-modal-footer">
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveEditor()}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void closeEditor()}>Cerrar</button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} titleId="boat-image-delete-title" className="max-w-md">
        {pendingDelete ? (
          <div className="rounded-2xl border border-white/60 bg-white p-5 shadow-2xl">
            <h2 id="boat-image-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar imagen</h2>
            <p className="admin-muted mt-2">Si es la principal y hay otra imagen activa, se promovera la siguiente automaticamente.</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" onClick={() => void deleteBoatImage(pendingDelete)}>Eliminar</button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setPendingDelete(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
