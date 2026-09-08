import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CreditCard, DollarSign, MessageSquare, Ship, Star } from 'lucide-react';

import { AdminBadge, AdminModuleSurface, AdminStatCard, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { money } from './adminMockData';

type DashboardReservation = {
  id: string;
  booking_reference: string;
  tour_date: string;
  payment_status: string;
  booking_status: string;
  total_snapshot: number;
  customers: { full_name: string; whatsapp: string } | null;
  tours: { title: string } | null;
};

export default function AdminDashboardPage() {
  const pendingReviewsQuery = useQuery({
    queryKey: ['admin', 'pendingReviews'],
    queryFn: async () => {
      const { count, error } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
  const pendingReviews = pendingReviewsQuery.data ?? 0;
  const reservationsQuery = useQuery({
    queryKey: ['admin', 'dashboardReservations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_reference, tour_date, payment_status, booking_status, total_snapshot, customers(full_name, whatsapp), tours(title)')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DashboardReservation[];
    },
    refetchInterval: 30_000,
  });
  const reservations = reservationsQuery.data ?? [];
  const paidReservations = reservations.filter((item) => item.payment_status === 'paid');
  const estimatedRevenue = 0;

  return (
    <div className="admin-page">
      <section className="admin-stat-grid">
        <AdminStatCard label="Reservas totales" value={reservationsQuery.isLoading ? '…' : String(reservations.length)} icon={CalendarDays} />
        <AdminStatCard label="Pagos pendientes" value={reservationsQuery.isLoading ? '…' : String(reservations.filter((item) => item.payment_status !== 'paid').length)} icon={CreditCard} tone="warning" />
        <AdminStatCard label="Ingresos" value={money(estimatedRevenue)} icon={DollarSign} tone="success" />
        <AdminStatCard label="Pagos confirmados" value={reservationsQuery.isLoading ? '…' : String(paidReservations.length)} icon={Star} />
        <AdminStatCard label="Reservas por confirmar" value={reservationsQuery.isLoading ? '…' : String(reservations.filter((item) => item.booking_status === 'pending_confirmation').length)} icon={Ship} />
        <AdminStatCard label="Comentarios por revisar" value={String(pendingReviews)} icon={MessageSquare} />
      </section>
      <AdminModuleSurface className="admin-dashboard-reservations">
        <div className="admin-module-surface__header">
          <div><h2>Reservas recientes</h2><p>Ultimas solicitudes listas para validar disponibilidad y pago.</p></div>
        </div>
        <AdminTable embedded headers={['Referencia', 'Cliente', 'Fecha', 'Tour', 'Pago', 'Reserva']}>
            {reservations.slice(0, 8).map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.booking_reference}</td>
                <td>{reservation.customers?.full_name ?? '-'}<div className="admin-muted">{reservation.customers?.whatsapp ?? '-'}</div></td>
                <td>{reservation.tour_date}</td>
                <td>{reservation.tours?.title ?? '-'}</td>
                <td><AdminBadge value={reservation.payment_status} /></td>
                <td><AdminBadge value={reservation.booking_status} /></td>
              </tr>
            ))}
            {!reservationsQuery.isLoading && reservations.length === 0 ? <tr><td colSpan={6} className="admin-muted">No hay reservas registradas todavía.</td></tr> : null}
        </AdminTable>
      </AdminModuleSurface>
    </div>
  );
}
