import { Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { adminData, money } from './adminMockData';

export default function AdminBoatsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Botes" description="Flota disponible para paquetes reservables." actions={<button className="admin-btn"><Plus size={16} /> Crear bote</button>} />
      <AdminTable headers={['Bote', 'Capacidad', 'Motor', 'Precio extra', 'Tours asociados', 'Estado', 'Acciones']}>
        {adminData.boats.map((boat) => (
          <tr key={boat.id}>
            <td>{boat.name}<div className="admin-muted">{boat.length}</div></td>
            <td>{boat.includedGuests} incluidos / {boat.maxGuests} max</td>
            <td>{boat.engine}</td>
            <td>{money(boat.extraGuestPrice)}</td>
            <td>{boat.tours.length}</td>
            <td><AdminBadge value /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
