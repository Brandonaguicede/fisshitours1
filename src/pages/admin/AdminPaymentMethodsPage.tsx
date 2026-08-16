import { Plus } from 'lucide-react';

import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

export default function AdminPaymentMethodsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Metodos de pago" description="Configura PayPal, WhatsApp payment link, pago el dia del tour y metodos manuales." actions={<button className="admin-btn"><Plus size={16} /> Crear metodo</button>} />
      <AdminTable headers={['Metodo', 'Tipo', 'Descripcion', 'Estado', 'Acciones']}>
        {adminData.paymentMethods.map((method) => (
          <tr key={method.id}>
            <td>{method.name}<div className="admin-muted">{method.id}</div></td>
            <td>{method.type}</td>
            <td>{method.description}</td>
            <td><AdminBadge value={method.active} /></td>
            <td><button className="admin-btn admin-btn--ghost">Editar</button></td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
