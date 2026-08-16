import { Download, Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData, money } from './adminMockData';

export default function AdminReservationsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Reservas" description="Gestiona solicitudes, estados de pago y disponibilidad." actions={<><button className="admin-btn"><Plus size={16} /> Crear reserva</button><button className="admin-btn admin-btn--secondary"><Download size={16} /> Exportar</button></>} />
      <AdminToolbar>
        <input className="admin-input" placeholder="Buscar cliente, email o WhatsApp" />
        <select className="admin-select"><option>Todos los estados</option><option>Confirmadas</option><option>Pendientes</option><option>Canceladas</option></select>
        <select className="admin-select"><option>Todos los pagos</option><option>Pagado</option><option>Pendiente</option></select>
        <input className="admin-input" type="date" />
      </AdminToolbar>
      <AdminTable headers={['Referencia', 'Cliente', 'Fecha', 'Bote / tour', 'Personas', 'Total', 'Metodo', 'Pago', 'Reserva', 'Acciones']}>
        {adminData.reservations.map((reservation) => (
          <tr key={reservation.id}>
            <td>{reservation.reference}</td>
            <td>{reservation.customer}<div className="admin-muted">{reservation.email}</div></td>
            <td>{reservation.date}</td>
            <td>{reservation.boat}<div className="admin-muted">{reservation.tour}</div></td>
            <td>{reservation.guests}</td>
            <td>{money(reservation.total)}</td>
            <td>{reservation.paymentMethod}</td>
            <td><AdminBadge value={reservation.paymentStatus} /></td>
            <td><AdminBadge value={reservation.reservationStatus} /></td>
            <td><button className="admin-btn admin-btn--ghost">Ver</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
