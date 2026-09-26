import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { adminSearchFilter, getAdminTablePage } from '../../services/adminListService';
import { Check, MessageSquare, Pencil, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminStatusSection, { AdminStatusRow } from '../../components/admin/AdminStatusSection';
import FormSection from '../../components/admin/FormSection';
import { AdminAvatar, AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminTable } from '../../components/admin/AdminPrimitives';
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
  // The comment being edited: everything beyond the first approval (visibility, featured, delete) is managed in its editor.
  const [editing, setEditing] = useState<AdminReview | null>(null);
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
    setEditing(null);
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

  // Keep the open editor in step with the refreshed list after each action (it may even fall out of the current filter).
  useEffect(() => {
    if (!editing) return;
    const fresh = pagination.rows.find((row) => row.id === editing.id);
    if (fresh && fresh !== editing) setEditing(fresh);
  }, [pagination.rows, editing]);

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
          reorder={{
            reordering: reorder.reordering,
            saving: reorder.saving || reorderLoading,
            onStart: () => void startReorder(),
            onCancel: reorder.cancel,
            onSave: () => void reorder.save(persistOrder),
            disabledReason: canReorder ? undefined : 'Limpia la búsqueda y el filtro de estado para reordenar.',
          }}
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
                <div className="admin-person">
                  <AdminAvatar name={review.name} imageUrl={review.image_url} />
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
                    {/* A comment that just arrived can be approved right here (the first decision); everything else lives in its editor. */}
                    {review.status === 'pending' ? (
                      <button className="admin-icon-action admin-icon-action--success" type="button" disabled={loading} title="Aprobar comentario" aria-label={`Aprobar comentario de ${review.name}`} onClick={() => void setStatus(review.id, 'approved')}>
                        <Check size={17} />
                      </button>
                    ) : null}
                    <button className="admin-icon-action" type="button" disabled={loading} title="Editar comentario" aria-label={`Editar comentario de ${review.name}`} onClick={() => setEditing(review)}>
                      <Pencil size={17} />
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

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} titleId="review-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="admin-modal-shell">
            <header className="admin-modal-header">
              <h2 id="review-edit-title" className="admin-card__title"><Pencil size={18} /> Editar comentario</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button>
            </header>
            <div className="admin-modal-body">
              {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
              {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}
              <section className="admin-review-summary" aria-label="Comentario">
                <div className="admin-review-summary__who">
                  <AdminAvatar name={editing.name} imageUrl={editing.image_url} />
                  <div>
                    <strong>{editing.name}</strong>
                    <p className="admin-muted">{editing.country ?? '-'} · {editing.rating} <Star size={12} className="inline fill-amber-400 text-amber-400" aria-hidden="true" /></p>
                  </div>
                </div>
                <blockquote className="admin-review-summary__quote">"{editing.quote}"</blockquote>
              </section>
              <FormSection title="Moderación" description="Decide si este comentario se publica." icon={<MessageSquare size={16} />}>
                <div className="admin-tour-config-row admin-tour-config-row--tour">
                  <div className="admin-tour-config-row__status">
                    <p className="admin-config-row__label">Estado del comentario</p>
                    <AdminBadge value={editing.status} />
                    <p className="admin-muted">{editing.status === 'approved' ? 'Aprobado: puede mostrarse en el sitio.' : editing.status === 'rejected' ? 'Rechazado: no se muestra en el sitio.' : 'Pendiente: todavía no se muestra en el sitio.'}</p>
                  </div>
                  <div className="admin-actions">
                    <button className="admin-btn" type="button" disabled={loading || editing.status === 'approved'} aria-label={`Aprobar comentario de ${editing.name}`} onClick={() => void setStatus(editing.id, 'approved')}><Check size={15} /> Aprobar</button>
                    <button className="admin-btn admin-btn--secondary" type="button" disabled={loading || editing.status === 'rejected'} aria-label={`Rechazar comentario de ${editing.name}`} onClick={() => void setStatus(editing.id, 'rejected')}><X size={15} /> Rechazar</button>
                  </div>
                </div>
              </FormSection>
              <AdminStatusSection
                description="Controla si este comentario se muestra en el sitio público."
                active={editing.active}
                visibleHint="Visible: aparece en el sitio público (si está aprobado)."
                hiddenHint="Oculto: no aparece en el sitio público, aunque esté aprobado."
                hideLabel="Ocultar comentario"
                showLabel="Mostrar comentario"
                busy={loading}
                onToggle={() => void setActive(editing.id, !editing.active)}
                deleteAction={{ title: 'Eliminar comentario', description: 'Se quita del panel y del sitio público. No se puede deshacer.', label: 'Eliminar comentario', onDelete: () => setPendingDelete(editing) }}
              >
                <AdminStatusRow
                  label="Destacado"
                  badge={<AdminBadge value={editing.featured ? 'featured' : 'not_featured'} label={editing.featured ? 'Destacado' : 'No destacado'} />}
                  hint={editing.featured ? 'Aparece primero entre los comentarios.' : 'Se muestra en su orden normal.'}
                  button={(
                    <button className={`admin-btn ${editing.featured ? 'admin-btn--secondary' : ''}`} type="button" disabled={loading} onClick={() => void setFeatured(editing.id, !editing.featured)}>
                      <Star size={15} className={editing.featured ? 'fill-amber-400 text-amber-400' : undefined} />
                      {editing.featured ? 'Quitar de destacados' : 'Destacar comentario'}
                    </button>
                  )}
                />
              </AdminStatusSection>
            </div>
          </div>
        ) : null}
      </Modal>

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
