import { Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData, money } from './adminMockData';

export default function AdminBoatToursPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Paquetes por bote" description="Paquetes reservables, horarios, capacidades y precios reales." actions={<button className="admin-btn"><Plus size={16} /> Crear paquete</button>} />
      <AdminToolbar>
        <input className="admin-input" placeholder="Buscar paquete" />
        <select className="admin-select"><option>Todos los botes</option><option>Second Wind</option></select>
        <select className="admin-select"><option>Todas las categorias</option><option>Fishing</option><option>Water Toys</option></select>
      </AdminToolbar>
      <AdminTable headers={['Paquete', 'Categoria', 'Duracion', 'Precio base', 'Capacidad', 'Horarios', 'Estado', 'Acciones']}>
        {adminData.boatTours.map((tour) => (
          <tr key={tour.id}>
            <td>{tour.name}<div className="admin-muted">{tour.id}</div></td>
            <td>{tour.category}</td>
            <td>{tour.duration ? `${tour.duration}h` : 'Noche'}</td>
            <td>{tour.customQuote ? 'Cotizar' : money(tour.basePrice)}</td>
            <td>{tour.includedGuests} incluidos / {tour.maxGuests} max</td>
            <td>{tour.timeSlots.map((slot) => slot.time).join(', ')}</td>
            <td><AdminBadge value /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
