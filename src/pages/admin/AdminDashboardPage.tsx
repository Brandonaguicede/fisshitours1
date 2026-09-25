import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CreditCard, DollarSign, MessageSquare, Ship, Star } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { AdminBadge, AdminModuleSurface, AdminStatCard, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { fetchDashboardKpis, fetchPendingReviewsCount, fetchRecentReservations } from '../../services/adminDashboardService';
import type { DashboardKpis } from '../../utils/dashboardMetrics';
import { money } from '../../utils/format';

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const pendingReviewsQuery = useQuery({
    queryKey: ['admin', 'pendingReviews'],
    queryFn: fetchPendingReviewsCount,
    refetchInterval: 30_000,
    retry: false,
  });
  const kpisQuery = useQuery({
    queryKey: ['admin', 'dashboardKpis'],
    queryFn: fetchDashboardKpis,
    refetchInterval: 30_000,
    retry: false,
  });
  const reservationsQuery = useQuery({
    queryKey: ['admin', 'dashboardReservations'],
    queryFn: () => fetchRecentReservations(8),
    refetchInterval: 30_000,
    retry: false,
  });
  const reservations = reservationsQuery.data ?? [];
  const kpis = kpisQuery.data;
  // A card that is loading shows "…" and one that failed shows "—": never a made-up 0.
  const kpiValue = (pick: (value: DashboardKpis) => string) => (kpisQuery.isLoading ? '…' : kpis ? pick(kpis) : '—');
  const pendingReviewsValue = pendingReviewsQuery.isLoading ? '…' : pendingReviewsQuery.data === undefined ? '—' : String(pendingReviewsQuery.data);
  const hasLoadError = kpisQuery.isError || reservationsQuery.isError || pendingReviewsQuery.isError;
  const isRefetching = kpisQuery.isFetching || reservationsQuery.isFetching || pendingReviewsQuery.isFetching;
  const loadError = kpisQuery.error ?? reservationsQuery.error ?? pendingReviewsQuery.error;

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardReservations'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardKpis'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <div className="admin-page">
      {hasLoadError ? (
        <div className="admin-alert admin-alert--danger" role="alert">
          <p>No se pudieron cargar los datos del Dashboard. {loadError instanceof Error ? loadError.message : 'Intenta nuevamente.'}</p>
          <button className="admin-btn admin-btn--secondary" type="button" disabled={isRefetching} onClick={() => { void kpisQuery.refetch(); void reservationsQuery.refetch(); void pendingReviewsQuery.refetch(); }}>Reintentar</button>
          <Link className="admin-btn admin-btn--secondary" to="/admin/login">Iniciar sesion</Link>
        </div>
      ) : null}
      <section className="admin-stat-grid">
        <AdminStatCard label="Reservas totales" value={kpiValue((value) => String(value.totalReservations))} icon={CalendarDays} />
        <AdminStatCard label="Pagos pendientes" value={kpiValue((value) => String(value.pendingPayments))} icon={CreditCard} tone="warning" />
        <AdminStatCard label="Ingresos" value={kpiValue((value) => money(value.revenue))} icon={DollarSign} tone="success" />
        <AdminStatCard label="Pagos confirmados" value={kpiValue((value) => String(value.confirmedPayments))} icon={Star} />
        <AdminStatCard label="Reservas por confirmar" value={kpiValue((value) => String(value.reservationsToConfirm))} icon={Ship} />
        <AdminStatCard label="Comentarios por revisar" value={pendingReviewsValue} icon={MessageSquare} />
      </section>
      <AdminModuleSurface className="admin-dashboard-reservations">
        <div className="admin-module-surface__header">
          <div><h2>Reservas recientes</h2><p>Ultimas solicitudes listas para validar disponibilidad y pago.</p></div>
        </div>
        <AdminTable embedded headers={['Referencia', 'Cliente', 'Fecha', 'Tour', 'Pago', 'Reserva']}>
            {reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.booking_reference}</td>
                <td>{reservation.customers?.full_name ?? '-'}<div className="admin-muted">{reservation.customers?.whatsapp ?? '-'}</div></td>
                <td>{reservation.tour_date}</td>
                <td>{reservation.tours?.title ?? '-'}</td>
                <td><AdminBadge value={reservation.payment_status} /></td>
                <td><AdminBadge value={reservation.booking_status} /></td>
              </tr>
            ))}
            {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? <tr><td colSpan={6} className="admin-muted">No hay reservas registradas todavía.</td></tr> : null}
        </AdminTable>
      </AdminModuleSurface>
    </div>
  );
}
