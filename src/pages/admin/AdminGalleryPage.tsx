import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { adminSearchFilter, getAdminTablePage } from '../../services/adminListService';
import { useQuery } from '@tanstack/react-query';
import { readWithAdminSession } from '../../services/adminAuthService';
import { Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminMediaCard } from '../../components/admin/AdminMediaKit';
import AdminStatusSection from '../../components/admin/AdminStatusSection';
import { AdminBadge, AdminCreateButton, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle } from '../../components/admin/AdminPrimitives';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
import type { StorageImage } from '../../services/imageService';
import { friendlyDeleteError } from '../../utils/adminErrors';

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

// The image description (alt text) is not exposed in the Admin: new images start with a fixed bilingual alt and existing ones keep the
// one they have; saving from here never rewrites it (and never calls the translator).

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
  const openEditor = (row: GalleryRow) => setEditing({ ...row });

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
        // Persist any pending category/visibility edits so closing the modal never silently discards them (upload only saves the image).
        await supabase
          .from('gallery_images')
          .update({ category: editing.category, active: editing.active, sort_order: editing.sort_order })
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
    const { error } = await supabase
      .from('gallery_images')
      .update({ category: editing.category, active: editing.active, sort_order: editing.sort_order })
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
          searchPlaceholder="Buscar por título"
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
          primaryAction={<AdminCreateButton label="Nueva imagen" disabled={reorder.reordering} onClick={() => void createImage()} />}
          reorder={{
            reordering: reorder.reordering,
            saving: reorder.saving || reorderLoading,
            onStart: () => void startReorder(),
            onCancel: reorder.cancel,
            onSave: () => void reorder.save(persistOrder),
            disabledReason: canReorder ? undefined : 'Limpia la búsqueda y el filtro de categoría para reordenar.',
          }}
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
            <AdminMediaCard
              className={`${reorder.reordering ? 'admin-sortable-row' : ''}${reorder.dragId === image.id ? ' admin-sortable-row--dragging' : ''}`.trim()}
              key={image.id}
              {...(reorder.reordering ? reorder.dragHandlers(image.id) : {})}
              url={image.src ?? image.image_url}
              alt={image.alt}
              emptyText="Sin imagen"
              title={image.title || image.category}
              subtitle={image.title ? image.category : ''}
              footer={reorder.reordering ? (
                <AdminReorderHandle
                  position={index + 1}
                  total={reorder.order.length}
                  dragging={reorder.dragId === image.id}
                  onMoveUp={() => reorder.moveBy(image.id, -1)}
                  onMoveDown={() => reorder.moveBy(image.id, 1)}
                />
              ) : (
                <>
                  {/* State as text through the shared status vocabulary (Visible / Oculta). */}
                  <AdminBadge value={image.active ? 'visible' : 'hidden_f'} />
                  <div className="admin-row-actions">
                    <button className="admin-icon-action" type="button" disabled={loading} title="Editar imagen" aria-label={`Editar imagen ${image.title || image.category}`} onClick={() => openEditor(image)}><Pencil size={17} /></button>
                  </div>
                </>
              )}
            />
          ))}
          {!loading && !queryError && visibleImages.length === 0 ? (
            <div className="admin-empty">No hay imágenes en este estado.</div>
          ) : null}
        </section>
      {reorder.reordering ? null : <AdminPagination {...pagination} noun="imágenes" loading={loading} />}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="gallery-edit-title" className="max-w-2xl admin-gallery-modal">
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
                showDelete={false}
                onImageSaved={onImageSaved}
                onImageDeleted={onImageDeleted}
              />
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="admin-muted">Categoria</span>
                  <select className="admin-select" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
              </div>
              <AdminStatusSection
                description="Controla si esta imagen se muestra en el sitio público."
                active={editing.active}
                visibleHint="Visible: aparece en la galería pública."
                hiddenHint="Oculta: no aparece en la galería pública."
                hideLabel="Ocultar imagen"
                showLabel="Mostrar imagen"
                onToggle={() => setEditing({ ...editing, active: !editing.active })}
                deleteAction={{ title: 'Eliminar imagen', description: 'Elimina esta imagen de la galería y del almacenamiento. No se puede deshacer.', label: 'Eliminar imagen', onDelete: () => setPendingDelete(editing) }}
              />
            </div>
            <ModalFooter>
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveEditor()}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
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
