import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Image as ImageIcon, ImagePlus, Info, Loader2, Pencil, Plus, Save, Settings2, Star, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import ToggleSwitch from '../../components/admin/ToggleSwitch';
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
  badge: string | null;
  base_price_label: string | null;
  length: string | null;
  engine: string | null;
  featured_spec: string | null;
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
  const [pendingBoatDelete, setPendingBoatDelete] = useState<BoatRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ id?: string; slug?: string; name?: string; includedGuests?: string; maxGuests?: string; extraPrice?: string }>({});

  async function loadBoats() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('boats')
      .select('id, slug, name, images, badge, base_price_label, length, engine, featured_spec, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
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
    setFieldErrors({});
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    setSelectedImageId((images.find((image) => image.is_primary) ?? images[0])?.id ?? null);
  }

  async function createBoat() {
    setNotice('');
    setError('');
    setFieldErrors({});
    const id = `nuevo-bote-${Date.now()}`;
    setEditing({
      id,
      slug: id,
      name: '',
      images: [],
      badge: '',
      base_price_label: '',
      length: '',
      engine: '',
      featured_spec: '',
      included_guests: 5,
      max_guests: 10,
      extra_guest_price: 65,
      image_url: null,
      image_public_id: null,
      active: true,
      sort_order: (boats?.length ?? 0) + 1,
      boat_images: [],
    });
    setSelectedImageId(null);
  }

  async function closeEditor() {
    setEditing(null);
    setSelectedImageId(null);
    setPendingDelete(null);
    setPendingBoatDelete(null);
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
      .select('id, slug, name, images, badge, base_price_label, length, engine, featured_spec, included_guests, max_guests, extra_guest_price, image_url, image_public_id, active, sort_order')
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
    if (!editing || saving) return;
    const nextFieldErrors: typeof fieldErrors = {};
    const isExisting = Boolean(boats?.some((boat) => boat.id === editing.id));
    const id = editing.id.trim();
    const slug = editing.slug.trim();
    const name = editing.name.trim();
    if (!id || !/^[a-z0-9-]+$/i.test(id)) {
      nextFieldErrors.id = 'Usa solo letras, numeros y guiones.';
    }
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      nextFieldErrors.slug = 'Usa solo letras, numeros y guiones.';
    }
    if (!name) {
      nextFieldErrors.name = 'El nombre es obligatorio.';
    }
    if (!Number.isFinite(editing.included_guests) || editing.included_guests < 1) {
      nextFieldErrors.includedGuests = 'Debe incluir al menos 1 persona.';
    }
    if (!Number.isFinite(editing.max_guests) || editing.max_guests < editing.included_guests) {
      nextFieldErrors.maxGuests = 'La capacidad maxima no puede ser menor a las personas incluidas.';
    } else if (editing.id === 'segundo-viento' && editing.max_guests > 10) {
      nextFieldErrors.maxGuests = 'Second Wind no puede superar 10 pasajeros.';
    }
    if (!Number.isFinite(editing.extra_guest_price) || editing.extra_guest_price < 0) {
      nextFieldErrors.extraPrice = 'El precio adicional no puede ser negativo.';
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError('Revisa los campos marcados antes de guardar.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      slug,
      name,
      badge: editing.badge?.trim() || null,
      base_price_label: editing.base_price_label?.trim() || null,
      length: editing.length?.trim() || null,
      engine: editing.engine?.trim() || null,
      featured_spec: editing.featured_spec?.trim() || null,
      included_guests: editing.included_guests,
      max_guests: editing.max_guests,
      extra_guest_price: editing.extra_guest_price,
      active: editing.active,
      sort_order: editing.sort_order,
      images: editing.images ?? [],
      image_url: editing.image_url,
      image_public_id: editing.image_public_id,
      updated_at: new Date().toISOString(),
    };
    const { error } = isExisting
      ? await supabase.from('boats').update(payload).eq('id', editing.id)
      : await supabase.from('boats').insert({ ...payload, id });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(isExisting ? 'Bote actualizado.' : 'Bote creado.');
    await refreshEditing(id);
  }

  async function deleteBoat(boat: BoatRow) {
    setSaving(true);
    setError('');
    setNotice('');
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    const { error } = await supabase.from('boats').delete().eq('id', boat.id);
    if (error) {
      setSaving(false);
      setPendingBoatDelete(null);
      setError(`${error.message}. Si el bote tiene reservas o referencias historicas, desactivalo en lugar de eliminarlo.`);
      return;
    }
    for (const image of images) {
      if (!image.storage_path) continue;
      try {
        await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'boat_images', resourceId: image.id });
      } catch {
        // The database row is already gone; storage cleanup can be retried separately if needed.
      }
    }
    setSaving(false);
    setPendingBoatDelete(null);
    setEditing(null);
    setNotice('Bote eliminado.');
    await loadBoats();
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
  const isExistingBoat = Boolean(editing && boats?.some((boat) => boat.id === editing.id));

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
                <div className="admin-actions">
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => openEditor(boat)}><Pencil size={14} /> Editar</button>
                  <button className="admin-btn admin-btn--danger" type="button" onClick={() => setPendingBoatDelete(boat)}><Trash2 size={14} /> Eliminar</button>
                </div>
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
          <form
            className="admin-boat-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor();
            }}
          >
            <header className="admin-modal-header">
              <h2 id="boat-edit-title" className="admin-card__title"><Pencil size={18} /> {boats?.some((boat) => boat.id === editing.id) ? 'Editar bote' : 'Crear bote'}</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" disabled={saving} onClick={() => void closeEditor()}><X size={18} /></button>
            </header>

            <div className="admin-modal-body">
              {error ? (
                <div className="admin-alert admin-alert--danger" role="alert">
                  {needsEditorNotice(error)
                    ? 'No se pudo guardar: se requiere una sesion de admin/editor en Supabase.'
                    : error}
                </div>
              ) : null}

              <FormSection
                title="Imagen del bote"
                description={isExistingBoat ? 'Sube nuevas fotos, ordena la galeria y elige la imagen principal.' : 'Guarda la informacion del bote para habilitar la carga de imagenes.'}
                icon={<ImageIcon size={16} />}
              >
                <section className="admin-boat-images">
                  {isExistingBoat ? (
                    <>
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
                        label={`${editing.name || 'Bote'} galeria`}
                        aspect={16 / 9}
                        maxWidth={1600}
                        maxHeight={900}
                        maxSizeMB={0.6}
                        onImageSaved={onGalleryImageSaved}
                      />
                    </>
                  ) : (
                    <div className="admin-empty">Completa los datos y guarda el bote. Despues podras subir sus fotos.</div>
                  )}
                </section>
              </FormSection>

              <div className="admin-form-columns">
                <FormSection title="Informacion general" description="Datos que identifican al bote." icon={<Info size={16} />}>
                  <label className="admin-field">
                    <span className="admin-field__label">Nombre</span>
                    <input id="boat-name" name="name" className="admin-input" aria-invalid={fieldErrors.name ? true : undefined} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                    {fieldErrors.name ? <span className="admin-field-error">{fieldErrors.name}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">ID interno</span>
                    <input id="boat-id" name="id" className="admin-input" aria-invalid={fieldErrors.id ? true : undefined} disabled={boats?.some((boat) => boat.id === editing.id)} value={editing.id} onChange={(event) => setEditing({ ...editing, id: event.target.value })} />
                    {fieldErrors.id ? <span className="admin-field-error">{fieldErrors.id}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Slug</span>
                    <input id="boat-slug" name="slug" className="admin-input" aria-invalid={fieldErrors.slug ? true : undefined} value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} />
                    {fieldErrors.slug ? <span className="admin-field-error">{fieldErrors.slug}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Etiqueta</span>
                    <input id="boat-badge" name="badge" className="admin-input" value={editing.badge ?? ''} onChange={(event) => setEditing({ ...editing, badge: event.target.value || null })} placeholder="Ej. Luxury meets nature" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Texto de precio base</span>
                    <input id="boat-base-price-label" name="base_price_label" className="admin-input" value={editing.base_price_label ?? ''} onChange={(event) => setEditing({ ...editing, base_price_label: event.target.value || null })} placeholder="Ej. From $600" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Eslora</span>
                    <input id="boat-length" name="length" className="admin-input" value={editing.length ?? ''} onChange={(event) => setEditing({ ...editing, length: event.target.value || null })} placeholder="Ej. 32 pies" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Motor</span>
                    <input id="boat-engine" name="engine" className="admin-input" value={editing.engine ?? ''} onChange={(event) => setEditing({ ...editing, engine: event.target.value || null })} placeholder="Ej. 2x Yamaha 250HP" />
                  </label>
                </FormSection>

                <FormSection title="Capacidad y precios" description="Base para el calculo de reservaciones." icon={<Users size={16} />}>
                  <label className="admin-field">
                    <span className="admin-field__label">Personas incluidas</span>
                    <input
                      id="boat-included-guests"
                      name="included_guests"
                      className="admin-input"
                      type="number"
                      min={1}
                      aria-invalid={fieldErrors.includedGuests ? true : undefined}
                      value={editing.included_guests}
                      onChange={(event) => setEditing({ ...editing, included_guests: Number(event.target.value) })}
                    />
                    {fieldErrors.includedGuests ? <span className="admin-field-error">{fieldErrors.includedGuests}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Capacidad maxima</span>
                    <input
                      id="boat-max-guests"
                      name="max_guests"
                      className="admin-input"
                      type="number"
                      min={1}
                      max={editing.id === 'segundo-viento' ? 10 : undefined}
                      aria-invalid={fieldErrors.maxGuests ? true : undefined}
                      value={editing.max_guests}
                      onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })}
                    />
                    {fieldErrors.maxGuests ? <span className="admin-field-error">{fieldErrors.maxGuests}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Precio por persona adicional (USD)</span>
                    <input
                      id="boat-extra-price"
                      name="extra_guest_price"
                      className="admin-input"
                      type="number"
                      min={0}
                      aria-invalid={fieldErrors.extraPrice ? true : undefined}
                      value={editing.extra_guest_price}
                      onChange={(event) => setEditing({ ...editing, extra_guest_price: Number(event.target.value) })}
                    />
                    {fieldErrors.extraPrice ? <span className="admin-field-error">{fieldErrors.extraPrice}</span> : null}
                  </label>
                </FormSection>
              </div>

              <FormSection title="Estado y configuracion" description="Controla visibilidad y orden en el sitio publico." icon={<Settings2 size={16} />}>
                <label className="admin-field">
                  <span className="admin-field__label">Especificaciones destacadas</span>
                  <textarea className="admin-input min-h-28" value={editing.featured_spec ?? ''} onChange={(event) => setEditing({ ...editing, featured_spec: event.target.value || null })} placeholder="GPS, radio VHF, sonido, bano, juguetes acuaticos..." />
                </label>
                <ToggleSwitch
                  checked={editing.active}
                  onChange={(active) => setEditing({ ...editing, active })}
                  label="Bote activo"
                  description="Los botes inactivos no se muestran en el sitio ni admiten reservaciones."
                  disabled={saving}
                />
                <label className="admin-field admin-field--narrow">
                  <span className="admin-field__label">Orden de despliegue</span>
                  <input id="boat-sort-order" name="sort_order" className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} />
                </label>
              </FormSection>
            </div>

            <ModalFooter>
              <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => void closeEditor()}>Cancelar</button>
              <button className="admin-btn" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? (
                  <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                ) : (
                  <><Save size={15} /> Guardar cambios</>
                )}
              </button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} titleId="boat-image-delete-title" className="max-w-md">
        {pendingDelete ? (
          <div className="admin-modal-card">
            <h2 id="boat-image-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar imagen</h2>
            <p className="admin-muted mt-2">Si es la principal y hay otra imagen activa, se promovera la siguiente automaticamente.</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" onClick={() => void deleteBoatImage(pendingDelete)}>Eliminar</button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setPendingDelete(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(pendingBoatDelete)} onClose={() => setPendingBoatDelete(null)} titleId="boat-delete-title" className="max-w-md">
        {pendingBoatDelete ? (
          <div className="admin-modal-card">
            <h2 id="boat-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar bote</h2>
            <p className="admin-muted mt-2">Esta accion elimina el bote y sus asociaciones. Si tiene reservas historicas, la base de datos puede bloquear la eliminacion.</p>
            <p className="mt-3 font-semibold text-ocean-950">{pendingBoatDelete.name}</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" disabled={saving} onClick={() => void deleteBoat(pendingBoatDelete)}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                {saving ? 'Eliminando...' : 'Eliminar bote'}
              </button>
              <button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={() => setPendingBoatDelete(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
