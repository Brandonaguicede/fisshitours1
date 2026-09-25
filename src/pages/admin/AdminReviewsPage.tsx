import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { adminSearchFilter, getAdminTablePage } from '../../services/adminListService';
import { Check, EyeOff, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminReorderToolbar, AdminTable } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { friendlyDeleteError } from '../../utils/adminErrors';

interface AdminReview {
  id: string;
  name: string;
  country: string | null;
  quote: string;
  quote_es: string;
  quote_en: string;
  translated: boolean;
  rating: number;
  status: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  image_url: string | null;
  image_public_id: string | null;
  created_at: string;
}

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
];

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

export default function AdminReviewsPage() {
  const db = supabase as any;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdminReview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const pagination = useAdminPagedList<AdminReview>('reviews', JSON.stringify({ filter, search }), (page, size) => getAdminTablePage(() => {
    let query = (supabase as any).from('reviews').select('id, name, country, quote, quote_es, quote_en, translated, rating, status, featured, active, sort_order, image_url, image_public_id, created_at', { count: 'exact' }).order('featured', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false }).order('id');
    if (filter !== 'all') query = query.eq('status', filter);
    if (search) query = query.or(adminSearchFilter(['name', 'country', 'quote', 'quote_es', 'quote_en'], search));
    return query;
  }, page, size));
  const loading = pagination.query.isFetching;
  const queryError = pagination.query.error instanceof Error ? pagination.query.error.message : '';
  async function loadReviews() { setError(''); await pagination.query.refetch(); }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setNotice('');
    setError('');
    const { error } = await db.from('reviews').update({ status }).eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(status === 'approved' ? 'Comentario aprobado. Ya se muestra en el sitio.' : 'Comentario oculto del sitio.');
    await loadReviews();
  }

  async function setFeatured(id: string, featured: boolean) {
    setNotice('');
    setError('');
    const { error } = await db.from('reviews').update({ featured }).eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(featured ? 'Comentario marcado como destacado.' : 'Comentario quitado de destacados.');
    await loadReviews();
  }

  async function setActive(id: string, active: boolean) {
    setNotice('');
    setError('');
    const { error } = await db.from('reviews').update({ active }).eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(active ? 'Comentario visible nuevamente.' : 'Comentario oculto sin eliminar.');
    await loadReviews();
  }

  async function deleteReview(review: AdminReview) {
    setNotice('');
    setError('');
    const { error } = await db.from('reviews').delete().eq('id', review.id);
    if (error) {
      setError(friendlyDeleteError(error, 'este comentario'));
      return;
    }
    setPendingDelete(null);
    setNotice('Comentario eliminado.');
    await loadReviews();
  }

  const visibleReviews = pagination.rows;
  // `pagination.rows` just gives the hook a stable reference while not
  // reordering; `startReorder()` overrides it with the full, unpaginated
  // set (in the same featured-first order the public site uses) before
  // switching into reorder mode.
  const reorder = useAdminReorder<AdminReview>(pagination.rows);
  const [reorderLoading, setReorderLoading] = useState(false);
  const canReorder = filter === 'all' && search.trim() === '';

  async function startReorder() {
    setReorderLoading(true);
    setError('');
    const { data, error } = await db.from('reviews').select('id, name, country, quote, quote_es, quote_en, translated, rating, status, featured, active, sort_order, image_url, image_public_id, created_at').order('featured', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false }).order('id');
    setReorderLoading(false);
    if (error) { setError(error.message); return; }
    reorder.start((data ?? []) as AdminReview[]);
  }

  async function persistOrder(updates: Array<{ id: string; sort_order: number }>) {
    for (const update of updates) {
      const { error } = await db.from('reviews').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) { setError(error.message); throw new Error(error.message); }
    }
    setNotice('Orden actualizado.');
    await loadReviews();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Comentarios" description="Modera reseñas pendientes, aprobadas, destacadas y ocultas." />

      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar comentarios"
          filters={
            <AdminFilterMenu panelLabel="Filtros de comentarios" panelDescription="Refina la lista de comentarios." activeCount={Number(filter !== 'all')} onReset={() => setFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Estado</span>
                <select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </AdminFilterMenu>
          }
          secondaryActions={
            // Old comments needing translation are covered by the single
            // "Reparar traducciones antiguas" button in Admin → Contenido, not a
            // separate one here.
            <AdminReorderToolbar
              reordering={reorder.reordering}
              saving={reorder.saving || reorderLoading}
              onStart={() => void startReorder()}
              onCancel={reorder.cancel}
              onSave={() => void reorder.save(persistOrder)}
              disabledReason={canReorder ? undefined : 'Limpia la búsqueda y el filtro de estado para reordenar.'}
            />
          }
        />

      {error || queryError ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error || queryError)
            ? 'No se pudo acceder a los comentarios: se requiere una sesion de admin/editor en Supabase.'
            : error || queryError}
        </div>
      ) : null}

      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? <p className="admin-muted" role="status">Cargando comentarios...</p> : null}
      <div aria-busy={loading}>
        <AdminTable embedded headers={reorder.reordering ? ['Orden', 'Cliente', 'Pais', 'Comentario', 'Rating', 'Estado'] : ['Cliente', 'Pais', 'Comentario', 'Rating', 'Estado', 'Acciones']}>
          {(reorder.reordering ? reorder.order : visibleReviews).map((review, index) => (
            <tr
              key={review.id}
              className={reorder.reordering ? `admin-sortable-row${reorder.dragId === review.id ? ' admin-sortable-row--dragging' : ''}` : undefined}
              {...(reorder.reordering ? reorder.dragHandlers(review.id) : {})}
            >
              {reorder.reordering ? (
                <td>
                  <AdminReorderHandle
                    position={index + 1}
                    total={reorder.order.length}
                    dragging={reorder.dragId === review.id}
                    onMoveUp={() => reorder.moveBy(review.id, -1)}
                    onMoveDown={() => reorder.moveBy(review.id, 1)}
                  />
                </td>
              ) : null}
              <td>
                <div className="flex items-center gap-3">
                  {review.image_url ? (
                    <img className="h-10 w-10 rounded-full object-cover" src={review.image_url} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-ocean-100 font-bold text-ocean-700" aria-hidden="true">
                      {review.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{review.name}</span>
                </div>
              </td>
              <td>{review.country ?? '-'}</td>
              <td className="admin-table__quote"><span className="admin-table__truncate" title={review.quote}>"{review.quote}"</span></td>
              <td>
                <span className="inline-flex items-center gap-1">
                  {review.rating} <Star size={13} className="fill-amber-400 text-amber-400" />
                </span>
              </td>
              <td><AdminBadge value={review.status} /></td>
              {reorder.reordering ? null : (
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-icon-action admin-icon-action--success" type="button" disabled={loading || review.status === 'approved'} title="Aprobar comentario" aria-label={`Aprobar comentario de ${review.name}`} onClick={() => void setStatus(review.id, 'approved')}>
                      <Check size={17} />
                    </button>
                    <button className="admin-icon-action admin-icon-action--danger" type="button" disabled={loading || review.status === 'rejected'} title="Rechazar comentario" aria-label={`Rechazar comentario de ${review.name}`} onClick={() => void setStatus(review.id, 'rejected')}>
                      <X size={17} />
                    </button>
                    <button className="admin-icon-action" type="button" disabled={loading} title={review.active ? 'Ocultar comentario' : 'Mostrar comentario'} aria-label={review.active ? `Ocultar comentario de ${review.name}` : `Mostrar comentario de ${review.name}`} onClick={() => void setActive(review.id, !review.active)}>
                      <EyeOff size={17} />
                    </button>
                    <button className="admin-icon-action admin-icon-action--warning" type="button" disabled={loading} title={review.featured ? 'Quitar de destacados' : 'Destacar comentario'} aria-label={review.featured ? `Quitar de destacados el comentario de ${review.name}` : `Destacar comentario de ${review.name}`} onClick={() => void setFeatured(review.id, !review.featured)}>
                      <Star size={17} />
                    </button>
                    <button className="admin-icon-action admin-icon-action--danger" type="button" disabled={loading} title="Eliminar comentario" aria-label={`Eliminar comentario de ${review.name}`} onClick={() => setPendingDelete(review)}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {!loading && !queryError && visibleReviews.length === 0 ? (
            <tr>
              <td colSpan={6} className="admin-muted">No hay comentarios para este filtro.</td>
            </tr>
          ) : null}
        </AdminTable>
      </div>
      {reorder.reordering ? null : <AdminPagination {...pagination} noun="reseñas" loading={loading} />}
      </AdminModuleSurface>

      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteReview(pendingDelete)}
        titleId="review-delete-title"
        title="Eliminar comentario"
        message={
          <>
            <p>El comentario se quitara del panel y de la pagina publica.</p>
            {pendingDelete ? <p className="mt-3 font-semibold">{pendingDelete.name}</p> : null}
          </>
        }
      />
    </div>
  );
}
