import { Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { adminData, money } from './adminMockData';

export default function AdminToursPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Tours" description="Tours generales visibles en la pagina publica." actions={<button className="admin-btn"><Plus size={16} /> Crear tour</button>} />
      <AdminToolbar>
        <input className="admin-input" placeholder="Buscar tour" />
        <select className="admin-select"><option>Todas las categorias</option><option>Fishing</option><option>Snorkeling & Beach</option><option>Surfing</option></select>
      </AdminToolbar>
      <AdminTable headers={['Tour', 'Categoria', 'Ubicacion', 'Precio', 'Rating', 'Estado', 'Acciones']}>
        {adminData.tours.map((tour) => (
          <tr key={tour.id}>
            <td>{tour.title}<div className="admin-muted">{tour.slug}</div></td>
            <td>{tour.category}</td>
            <td>{tour.location}</td>
            <td>{money(tour.price)}</td>
            <td>{tour.rating}</td>
            <td><AdminBadge value /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
