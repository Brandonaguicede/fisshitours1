import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CreditCard, DollarSign, MessageSquare, Ship, Star } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { AdminBadge, AdminModuleSurface, AdminStatCard, AdminTable } from '../../components/admin/AdminPrimitives';
import { DashboardAnalyticsPanel, formatIsoDay, type AnalyticsStatus } from '../../components/admin/DashboardCharts';
import { supabase } from '../../lib/supabase';
import { fetchDashboardOverview, fetchPendingReviewsCount } from '../../services/adminDashboardService';
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
  // One query feeds the KPI cards, the four analytics and "Reservas recientes": a single scan of bookings.
  const overviewQuery = useQuery({
    queryKey: ['admin', 'dashboardOverview'],
    queryFn: () => fetchDashboardOverview(),
    refetchInterval: 30_000,
    retry: false,
  });
  const overview = overviewQuery.data;
  const kpis = overview?.kpis;
  const recentReservations = overview?.recentReservations ?? [];
  // A card that is loading shows "…" and one that failed shows "—": never a made-up 0.
  const kpiValue = (pick: (value: DashboardKpis) => string) => (overviewQuery.isLoading ? '…' : kpis ? pick(kpis) : '—');
  const pendingReviewsValue = pendingReviewsQuery.isLoading ? '…' : pendingReviewsQuery.data === undefined ? '—' : String(pendingReviewsQuery.data);
  const hasLoadError = overviewQuery.isError || pendingReviewsQuery.isError;
  const isRefetching = overviewQuery.isFetching || pendingReviewsQuery.isFetching;
  const loadError = overviewQuery.error ?? pendingReviewsQuery.error;
  const overviewStatus: AnalyticsStatus = overview ? 'ready' : overviewQuery.isError ? 'error' : 'loading';

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardOverview'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <div className="admin-page">
      {hasLoadError ? (
        <div className="admin-alert admin-alert--danger" role="alert">
          <p>No se pudieron cargar los datos del Dashboard. {loadError instanceof Error ? loadError.message : 'Intenta nuevamente.'}</p>
          <button className="admin-btn admin-btn--secondary" type="button" disabled={isRefetching} onClick={() => { void overviewQuery.refetch(); void pendingReviewsQuery.refetch(); }}>Reintentar</button>
          <Link className="admin-btn admin-btn--secondary" to="/admin/login">Iniciar sesion</Link>
        </div>
      ) : null}
      <section className="admin-stat-grid" aria-label="Indicadores principales">
        <AdminStatCard label="Reservas totales" value={kpiValue((value) => String(value.totalReservations))} icon={CalendarDays} />
        <AdminStatCard label="Pagos pendientes" value={kpiValue((value) => String(value.pendingPayments))} icon={CreditCard} tone="warning" />
        <AdminStatCard label="Ingresos" value={kpiValue((value) => money(value.revenue))} icon={DollarSign} tone="success" />
        <AdminStatCard label="Pagos confirmados" value={kpiValue((value) => String(value.confirmedPayments))} icon={Star} />
        <AdminStatCard label="Reservas por confirmar" value={kpiValue((value) => String(value.reservationsToConfirm))} icon={Ship} />
        <AdminStatCard label="Comentarios por revisar" value={pendingReviewsValue} icon={MessageSquare} />
      </section>
      <AdminModuleSurface className="admin-dashboard-reservations">
        <div className="admin-module-surface__header admin-dash-recent__header">
          <h2 id="admin-dash-recent-title">Reservas recientes</h2>
        </div>
        <AdminTable embedded headers={['Cliente', 'Fecha del tour', 'Pago']}>
          {recentReservations.map((reservation) => (
            <tr key={reservation.id}>
              <td>{reservation.customerName ?? '-'}</td>
              <td>{formatIsoDay(reservation.tourDate, true)}</td>
              <td><AdminBadge value={reservation.paymentStatus} /></td>
            </tr>
          ))}
          {overviewStatus === 'ready' && recentReservations.length === 0 ? <tr><td colSpan={3} className="admin-muted">No hay reservas registradas todavía.</td></tr> : null}
          {overviewStatus === 'loading' ? <tr><td colSpan={3} className="admin-muted" role="status">Cargando…</td></tr> : null}
        </AdminTable>
      </AdminModuleSurface>
      <DashboardAnalyticsPanel analytics={overview?.analytics} status={overviewStatus} />
    </div>
  );
}
