import { Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

export default function AdminDestinationsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Destinos" description="Lugares y regiones mostrados en la pagina publica." actions={<button className="admin-btn"><Plus size={16} /> Crear destino</button>} />
      <AdminTable headers={['Destino', 'Region', 'Descripcion', 'Estado', 'Acciones']}>
        {adminData.destinations.map((destination) => (
          <tr key={destination.id}>
            <td>{destination.name}<div className="admin-muted">{destination.id}</div></td>
            <td>{destination.region}</td>
            <td>{destination.description}</td>
            <td><AdminBadge value /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
