import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CreditCard, DollarSign, MessageSquare, Plus, Ship, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

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
        actions={<><Link className="admin-btn" to="/admin/reservations"><Plus size={16} /> Nueva reserva</Link><Link className="admin-btn admin-btn--secondary" to="/admin/content">Editar home</Link></>}
      />
      <section className="admin-stat-grid">
        <AdminStatCard label="Reservas totales" value={String(adminData.reservations.length)} icon={CalendarDays} />
        <AdminStatCard label="Pagos pendientes" value={String(adminData.reservations.filter((item) => item.paymentStatus !== 'paid').length)} icon={CreditCard} color="#d97706" />
        <AdminStatCard label="Ingresos estimados" value={money(estimatedRevenue)} icon={DollarSign} color="#0f9f6e" />
        <AdminStatCard label="Tours activos" value={String(adminData.boatTours.length)} icon={Star} color="#2563eb" />
        <AdminStatCard label="Botes activos" value={String(adminData.boats.length)} icon={Ship} color="#0e7490" />
        <AdminStatCard label="Comentarios por revisar" value={String(pendingReviews)} icon={MessageSquare} color="#7c3aed" />
      </section>
      <div className="admin-grid-2">
        <div className="admin-card">
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
        <aside className="admin-card">
          <h2>Accesos rapidos</h2>
          <p>Flujos administrativos principales.</p>
          <ul className="admin-list mt-4">
            <li><span>Crear tour</span><Link className="admin-btn admin-btn--ghost" to="/admin/tours">Abrir</Link></li>
            <li><span>Crear bote</span><Link className="admin-btn admin-btn--ghost" to="/admin/boats">Abrir</Link></li>
            <li><span>Subir imagen Cloudflare</span><Link className="admin-btn admin-btn--ghost" to="/admin/gallery">Abrir</Link></li>
            <li><span>Aprobar comentarios</span><Link className="admin-btn admin-btn--ghost" to="/admin/reviews">Abrir</Link></li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
