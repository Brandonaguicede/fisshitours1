import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CreditCard, DollarSign, MessageSquare, Ship, Star } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminStatCard, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { adminData, money } from './adminMockData';

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
  const estimatedRevenue = adminData.reservations.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Panel de administracion"
        description="Resumen operativo de reservas, pagos, tours y contenido editable."
      />
      <section className="admin-stat-grid">
        <AdminStatCard label="Reservas totales" value={String(adminData.reservations.length)} icon={CalendarDays} />
        <AdminStatCard label="Pagos pendientes" value={String(adminData.reservations.filter((item) => item.paymentStatus !== 'paid').length)} icon={CreditCard} color="#b45309" />
        <AdminStatCard label="Ingresos estimados" value={money(estimatedRevenue)} icon={DollarSign} color="#047857" />
        <AdminStatCard label="Tours activos" value={String(adminData.boatTours.length)} icon={Star} color="#256f8f" />
        <AdminStatCard label="Botes activos" value={String(adminData.boats.length)} icon={Ship} color="#0e7490" />
        <AdminStatCard label="Comentarios por revisar" value={String(pendingReviews)} icon={MessageSquare} color="#6d5f3f" />
      </section>
      <div className="admin-card admin-dashboard-reservations">
        <h2>Reservas recientes</h2>
        <p>Ultimas solicitudes listas para validar disponibilidad y pago.</p>
        <div className="mt-4">
          <AdminTable headers={['Referencia', 'Cliente', 'Fecha', 'Tour', 'Pago', 'Reserva']}>
            {adminData.reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.reference}</td>
                <td>{reservation.customer}<div className="admin-muted">{reservation.whatsapp}</div></td>
                <td>{reservation.date}</td>
                <td>{reservation.tour}</td>
                <td><AdminBadge value={reservation.paymentStatus} /></td>
                <td><AdminBadge value={reservation.reservationStatus} /></td>
              </tr>
            ))}
          </AdminTable>
        </div>
      </div>
    </div>
  );
}
