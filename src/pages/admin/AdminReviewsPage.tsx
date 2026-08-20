import { Check, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';

interface AdminReview {
  id: string;
  name: string;
  country: string | null;
  quote: string;
  rating: number;
  status: string;
  featured: boolean;
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
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadReviews() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('reviews')
      .select('id, name, country, quote, rating, status, featured, created_at')
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error) {
      setReviews([]);
      setError(error.message);
      return;
    }
    setReviews((data ?? []) as AdminReview[]);
  }

  useEffect(() => {
    void loadReviews();
  }, []);

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setNotice('');
    setError('');
    const { error } = await supabase.from('reviews').update({ status }).eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(status === 'approved' ? 'Comentario aprobado. Ya se muestra en el sitio.' : 'Comentario rechazado. Ya no se muestra en el sitio.');
    await loadReviews();
  }

  const visibleReviews = (reviews ?? []).filter((review) => filter === 'all' || review.status === filter);

  return (
    <div className="admin-page">
      <AdminPageHeader title="Comentarios" description="Aprobar publica el comentario en el sitio; rechazar lo oculta." />

      <AdminToolbar>
        <select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </AdminToolbar>

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a los comentarios: se requiere una sesión de admin/editor en Supabase. Inicia sesión como admin o editor para aprobar o rechazar comentarios.'
            : error}
        </div>
      ) : null}

      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando comentarios...</p>
      ) : (
        <AdminTable headers={['Cliente', 'País', 'Comentario', 'Rating', 'Estado', 'Acciones']}>
          {visibleReviews.map((review) => (
            <tr key={review.id}>
              <td>{review.name}</td>
              <td>{review.country ?? '-'}</td>
              <td className="admin-table__quote">"{review.quote}"</td>
              <td>
                <span className="inline-flex items-center gap-1">
                  {review.rating} <Star size={13} className="fill-amber-400 text-amber-400" />
                </span>
              </td>
              <td><AdminBadge value={review.status} /></td>
              <td>
                <div className="flex gap-2">
                  <button
                    className="admin-btn admin-btn--success"
                    type="button"
                    disabled={review.status === 'approved'}
                    onClick={() => setStatus(review.id, 'approved')}
                  >
                    <Check size={14} /> Aprobar
                  </button>
                  <button
                    className="admin-btn admin-btn--danger"
                    type="button"
                    disabled={review.status === 'rejected'}
                    onClick={() => setStatus(review.id, 'rejected')}
                  >
                    <X size={14} /> Rechazar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {visibleReviews.length === 0 ? (
            <tr>
              <td colSpan={6} className="admin-muted">No hay comentarios en este estado.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}
    </div>
  );
}