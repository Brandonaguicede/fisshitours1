import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { adminSearchFilter, getAdminTablePage } from '../../services/adminListService';
import { useQuery } from '@tanstack/react-query';
import { readWithAdminSession } from '../../services/adminAuthService';
import { Eye, EyeOff, Plus, Pencil, Settings, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminReorderToolbar } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
import type { StorageImage } from '../../services/imageService';
import { translateTextsToSpanish } from '../../services/translationService';
import { friendlyDeleteError } from '../../utils/adminErrors';
import { editableText, textColumns, textsToTranslate, type BilingualColumns } from '../../utils/bilingualContent';

interface GalleryRow {
  id: string;
  src: string | null;
  image_url: string | null;
  image_public_id: string | null;
  alt: string;
  alt_en?: string | null;
  alt_es?: string | null;
  category: string;
  title: string | null;
  active: boolean;
  sort_order: number;
}

// The alt text is public (image description, shown in the visitor's language). The admin writes it in ENGLISH
// (alt_en, else the legacy alt) and DeepL generates alt_es when it is saved. `title` is not shown on the
// landing page (GallerySection only reads alt/alt_es/alt_en), so it stays a plain admin label.
const ALT: BilingualColumns = { legacy: 'alt', en: 'alt_en', es: 'alt_es' };

const CATEGORY_OPTIONS = ['fishing', 'experiences', 'boats', 'wildlife', 'beach'];

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

export default function AdminGalleryPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<GalleryRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryRow | null>(null);
  const [saving, setSaving] = useState(false);
  // The English alt as loaded: only a changed alt is translated on save.
  const altBeforeRef = useRef('');
  const openEditor = (row: GalleryRow) => {
    const alt = editableText(row as unknown as Record<string, unknown>, ALT);
    altBeforeRef.current = alt;
    setEditing({ ...row, alt });
  };

  const pagination = useAdminPagedList<GalleryRow>('gallery', JSON.stringify({ filter, search }), (page, size) => getAdminTablePage(() => {
    let query = (supabase as any).from('gallery_images').select('id, src, image_url, image_public_id, alt, alt_en, alt_es, category, title, active, sort_order', { count: 'exact' }).order('sort_order', { ascending: true }).order('id');
    if (filter !== 'all') query = query.eq('category', filter);
    if (search) query = query.or(adminSearchFilter(['alt', 'title'], search));
    return query;
  }, page, size));
  const loading = pagination.query.isFetching;
  const queryError = pagination.query.error instanceof Error ? pagination.query.error.message : '';
  async function loadImages() { setError(''); await pagination.query.refetch(); }

  // `pagination.rows` just gives the hook a stable reference while not
  // reordering; `startReorder()` below overrides it with the full,
  // unpaginated set before switching into reorder mode.
  const reorder = useAdminReorder<GalleryRow>(pagination.rows);
  const [reorderLoading, setReorderLoading] = useState(false);
  const canReorder = filter === 'all' && search.trim() === '';

  async function startReorder() {
    setReorderLoading(true);
    setError('');
    const { data, error } = await supabase.from('gallery_images').select('id, src, image_url, image_public_id, alt, alt_en, alt_es, category, title, active, sort_order').order('sort_order', { ascending: true }).order('id');
    setReorderLoading(false);
    if (error) { setError(error.message); return; }
    reorder.start((data ?? []) as GalleryRow[]);
  }

  async function persistOrder(updates: Array<{ id: string; sort_order: number }>) {
    for (const update of updates) {
      const { error } = await supabase.from('gallery_images').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) { setError(error.message); throw new Error(error.message); }
    }
    setNotice('Orden actualizado.');
    await loadImages();
  }

  async function createImage() {
    setNotice('');
    setError('');
    const initialCategory = filter === 'all' ? 'fishing' : filter;
    const { count, error: countError } = await supabase.from('gallery_images').select('id', { count: 'exact', head: true });
    if (countError) { setError(countError.message); return; }
    const { data, error } = await supabase
      .from('gallery_images')
      .insert({ id: `gal-${crypto.randomUUID()}`, alt: 'New image', alt_en: 'New image', alt_es: 'Nueva imagen', category: initialCategory, active: true, sort_order: (count ?? 0) + 1 })
      .select('id, src, image_url, image_public_id, alt, alt_en, alt_es, category, title, active, sort_order')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    openEditor(data as GalleryRow);
    await loadImages();
  }

  async function closeEditor() {
    if (editing) {
      if (!editing.src && !editing.image_url) {
        await supabase.from('gallery_images').delete().eq('id', editing.id);
      } else {
        // Persist any pending title/alt/category/order edits so closing the
        // modal never silently discards them (upload only saves the image).
        // Alt: English -> Spanish first; if DeepL fails the modal stays open with what was typed and nothing is saved.
        let altColumns: Record<string, unknown>;
        try {
          const alt = editing.alt.trim();
          altColumns = textColumns(alt, altBeforeRef.current, ALT, await translateTextsToSpanish(textsToTranslate(alt, altBeforeRef.current)));
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'No se pudo generar la traducción al español. Intenta nuevamente.');
          return;
        }
        await supabase
          .from('gallery_images')
          .update({ alt: editing.alt.trim(), ...altColumns, category: editing.category, title: editing.title, active: editing.active, sort_order: editing.sort_order })
          .eq('id', editing.id);
      }
      await loadImages();
    }
    setEditing(null);
  }

  async function saveEditor() {
    if (!editing) return;
    setSaving(true);
    setError('');
    setNotice('');
    let altColumns: Record<string, unknown>;
    try {
      const alt = editing.alt.trim();
      altColumns = textColumns(alt, altBeforeRef.current, ALT, await translateTextsToSpanish(textsToTranslate(alt, altBeforeRef.current)));
    } catch (caught) {
      setSaving(false);
      setError(caught instanceof Error ? caught.message : 'No se pudo generar la traducción al español. Intenta nuevamente.');
      return;
    }
    const { error } = await supabase
      .from('gallery_images')
      .update({ alt: editing.alt.trim(), ...altColumns, category: editing.category, title: editing.title, active: editing.active, sort_order: editing.sort_order })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    altBeforeRef.current = editing.alt.trim();
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
    if (row.image_public_id) {
      await deleteStorageImage({ storagePath: row.image_public_id, resourceTable: 'gallery_images', resourceId: row.id });
    }
    const { error } = await supabase.from('gallery_images').delete().eq('id', row.id);
    if (error) {
      setError(friendlyDeleteError(error, 'esta imagen'));
      return;
    }
    setPendingDelete(null);
    setEditing(null);
    setNotice('Imagen eliminada de la galería.');
    await loadImages();
  }

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'galleryCategories'],
    queryFn: () => readWithAdminSession(() => (supabase as any).rpc('list_admin_gallery_categories')),
  });
  const categories = useMemo(() => [...new Set([...CATEGORY_OPTIONS, ...((categoriesQuery.data ?? []) as string[]), editing?.category ?? '', filter])].filter((category) => category && category !== 'all'), [categoriesQuery.data, editing?.category, filter]);

  const visibleImages = pagination.rows;

  return (
    <div className="admin-page">
      <AdminPageHeader title="Galeria" description="Imagenes publicas gestionadas con Cloudflare R2." />

      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por alt o titulo"
          filters={
            <AdminFilterMenu panelLabel="Filtros de galeria" panelDescription="Refina la lista de imagenes." activeCount={Number(filter !== 'all')} onReset={() => setFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Categoria</span>
                <select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">Todas las categorias</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </AdminFilterMenu>
          }
          primaryAction={<button className="admin-btn" type="button" disabled={reorder.reordering} onClick={() => void createImage()}><Plus size={16} /> Nueva imagen</button>}
          secondaryActions={
            <AdminReorderToolbar
              reordering={reorder.reordering}
              saving={reorder.saving || reorderLoading}
              onStart={() => void startReorder()}
              onCancel={reorder.cancel}
              onSave={() => void reorder.save(persistOrder)}
              disabledReason={canReorder ? undefined : 'Limpia la búsqueda y el filtro de categoría para reordenar.'}
            />
          }
        />

      {error || queryError ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error || queryError)
            ? 'No se pudo acceder a la galería: se requiere una sesión de admin/editor en Supabase.'
            : error || queryError}
        </div>
      ) : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? <p className="admin-muted" role="status">Cargando galería...</p> : null}
        <section className="admin-media-grid" aria-busy={loading}>
          {(reorder.reordering ? reorder.order : visibleImages).map((image, index) => (
            <article
              className={`admin-media-card${reorder.reordering ? ' admin-sortable-row' : ''}${reorder.dragId === image.id ? ' admin-sortable-row--dragging' : ''}`}
              key={image.id}
              {...(reorder.reordering ? reorder.dragHandlers(image.id) : {})}
            >
              {image.src ?? image.image_url ? (
                <img src={image.src ?? image.image_url ?? ''} alt={image.alt} loading="lazy" decoding="async" width={1600} height={1200} />
              ) : (
                <div className="grid aspect-[4/3] place-items-center text-sm font-semibold admin-media-card__empty">Sin imagen</div>
              )}
              <div className="admin-media-card__body">
                <strong>{image.category}</strong>
                <span className="admin-muted">{image.alt}</span>
                <div className="admin-actions">
                  {reorder.reordering ? (
                    <AdminReorderHandle
                      position={index + 1}
                      total={reorder.order.length}
                      dragging={reorder.dragId === image.id}
                      onMoveUp={() => reorder.moveBy(image.id, -1)}
                      onMoveDown={() => reorder.moveBy(image.id, 1)}
                    />
                  ) : (
                    <>
                      <span className="admin-visibility-indicator" title={image.active ? 'Visible en el sitio' : 'Oculta'} aria-label={image.active ? 'Visible en el sitio' : 'Oculta'}>
                        {image.active ? <Eye size={15} /> : <EyeOff size={15} />}
                      </span>
                      <div className="admin-row-actions">
                        <button className="admin-icon-action" type="button" disabled={loading} title="Editar imagen" aria-label={`Editar imagen ${image.alt || image.category}`} onClick={() => openEditor(image)}><Pencil size={17} /></button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!loading && !queryError && visibleImages.length === 0 ? (
            <div className="admin-empty">No hay imágenes en este estado.</div>
          ) : null}
        </section>
      {reorder.reordering ? null : <AdminPagination {...pagination} noun="imágenes" loading={loading} />}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="gallery-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="admin-modal-shell">
            <header className="admin-modal-header">
              <h2 id="gallery-edit-title" className="admin-card__title"><Pencil size={18} /> Editar imagen</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => void closeEditor()}><X size={18} /></button>
            </header>
            <div className="admin-modal-body">
              {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
              {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}
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
                  <span className="admin-muted">Alt (en inglés: el español se genera al guardar)</span>
                  <input className="admin-input" value={editing.alt} onChange={(event) => setEditing({ ...editing, alt: event.target.value })} />
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Categoria</span>
                  <select className="admin-select" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
              </div>
              <p className="admin-field-help">Orden actual: {editing.sort_order}. Se reordena desde la lista con el botón "Reordenar".</p>
              <FormSection title="Configuracion" description="Controla si esta imagen se muestra en el sitio publico." icon={<Settings size={16} />}>
                <div className="admin-config-row">
                  <div>
                    <p className="admin-config-row__label">Estado actual</p>
                    <span className="admin-muted">{editing.active ? 'Visible: aparece en la galeria publica.' : 'Oculta: no aparece en la galeria publica.'}</span>
                  </div>
                  <button
                    className={`admin-btn ${editing.active ? 'admin-btn--secondary' : ''}`}
                    type="button"
                    onClick={() => setEditing({ ...editing, active: !editing.active })}
                  >
                    {editing.active ? <EyeOff size={15} /> : <Eye size={15} />}
                    {editing.active ? 'Ocultar imagen' : 'Mostrar imagen'}
                  </button>
                </div>
              </FormSection>

              <FormSection title="Zona de peligro" description="Esta accion no se puede deshacer." icon={<Trash2 size={16} />}>
                <div className="admin-danger-zone">
                  <p className="admin-muted">Elimina esta imagen de la galeria y de Storage.</p>
                  <button className="admin-btn admin-btn--danger" type="button" onClick={() => setPendingDelete(editing)}>
                    <Trash2 size={15} /> Eliminar imagen
                  </button>
                </div>
              </FormSection>
            </div>
            <ModalFooter>
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveEditor()}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button className="admin-btn admin-btn--secondary" type="button" onClick={() => void closeEditor()}>Cerrar</button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>

      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteRow(pendingDelete)}
        titleId="gallery-delete-title"
        title="Eliminar imagen"
        message={
          <>
            <p>Se solicitara borrar el objeto en Storage y luego se eliminara la referencia de la galeria.</p>
            {pendingDelete ? <p className="mt-3 font-semibold">{pendingDelete.title ?? pendingDelete.alt}</p> : null}
          </>
        }
      />
    </div>
  );
}
