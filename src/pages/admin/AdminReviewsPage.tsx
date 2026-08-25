import { Check, EyeOff, Search, Star, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';

interface AdminReview {
  id: string;
  name: string;
  country: string | null;
  quote: string;
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
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdminReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadReviews() {
    setLoading(true);
    setError('');
    const { data, error } = await db
      .from('reviews')
      .select('id, name, country, quote, rating, status, featured, active, sort_order, image_url, image_public_id, created_at')
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      setReviews([]);
      setError(error.message);
      return;
    }
    setReviews((data ?? []) as unknown as AdminReview[]);
  }

  useEffect(() => {
    void loadReviews();
  }, []);

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
      setError(error.message);
      return;
    }
    setPendingDelete(null);
    setNotice('Comentario eliminado.');
    await loadReviews();
  }

  const visibleReviews = (reviews ?? []).filter((review) => {
    const matchesStatus = filter === 'all' || review.status === filter;
    const text = `${review.name} ${review.country ?? ''} ${review.quote}`.toLowerCase();
    return matchesStatus && (!search || text.includes(search.toLowerCase()));
  });

  return (
    <div className="admin-page">
      <AdminPageHeader title="Comentarios" description="Modera reseñas pendientes, aprobadas, destacadas y ocultas." />

      <AdminToolbar>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ocean-400" size={15} />
          <input className="admin-input pl-9" placeholder="Buscar comentarios" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </AdminToolbar>

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a los comentarios: se requiere una sesion de admin/editor en Supabase.'
            : error}
        </div>
      ) : null}

      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando comentarios...</p>
      ) : (
        <AdminTable headers={['Cliente', 'Pais', 'Comentario', 'Rating', 'Estado', 'Acciones']}>
          {visibleReviews.map((review) => (
            <tr key={review.id}>
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
              <td className="admin-table__quote">"{review.quote}"</td>
              <td>
                <span className="inline-flex items-center gap-1">
                  {review.rating} <Star size={13} className="fill-amber-400 text-amber-400" />
                </span>
              </td>
              <td><AdminBadge value={review.status} /></td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <button className="admin-btn admin-btn--success" type="button" disabled={review.status === 'approved'} onClick={() => void setStatus(review.id, 'approved')}>
                    <Check size={14} /> Aprobar
                  </button>
                  <button className="admin-btn admin-btn--danger" type="button" disabled={review.status === 'rejected'} onClick={() => void setStatus(review.id, 'rejected')}>
                    <X size={14} /> Rechazar
                  </button>
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void setActive(review.id, !review.active)}>
                    <EyeOff size={14} /> Ocultar
                  </button>
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void setFeatured(review.id, !review.featured)}>
                    <Star size={14} /> {review.featured ? 'Quitar' : 'Destacar'}
                  </button>
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setPendingDelete(review)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {visibleReviews.length === 0 ? (
            <tr>
              <td colSpan={6} className="admin-muted">No hay comentarios para este filtro.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} titleId="review-delete-title" className="max-w-md">
        {pendingDelete ? (
          <div className="admin-modal-card">
            <h2 id="review-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar comentario</h2>
            <p className="admin-muted mt-2">El comentario se quitara del panel y de la pagina publica.</p>
            <p className="mt-3 font-semibold text-ocean-950">{pendingDelete.name}</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" onClick={() => void deleteReview(pendingDelete)}>Eliminar</button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setPendingDelete(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
