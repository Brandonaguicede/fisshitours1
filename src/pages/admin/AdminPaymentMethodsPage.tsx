import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { adminData } from './adminMockData';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function AdminPaymentMethodsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const visibleMethods = useMemo(
    () => adminData.paymentMethods
      .filter((method) => statusFilter === 'all' || (statusFilter === 'active') === method.active)
      .filter((method) => `${method.name} ${method.type}`.toLowerCase().includes(search.toLowerCase())),
    [search, statusFilter],
  );

  return (
    <div className="admin-page">
      <AdminPageHeader title="Metodos de pago" description="Configura PayPal, WhatsApp payment link, pago el dia del tour y metodos manuales." />
      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar metodo por nombre o tipo"
          filters={
            <AdminFilterMenu panelLabel="Filtros de metodos de pago" panelDescription="Refina la lista de metodos." activeCount={Number(statusFilter !== 'all')} onReset={() => setStatusFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Estado</span>
                <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </label>
            </AdminFilterMenu>
          }
          primaryAction={<button className="admin-btn" type="button"><Plus size={16} /> Crear metodo</button>}
        />
        <AdminTable embedded headers={['Metodo', 'Tipo', 'Descripcion', 'Estado', 'Acciones']}>
          {visibleMethods.map((method) => (
            <tr key={method.id}>
              <td>{method.name}<div className="admin-muted">{method.id}</div></td>
              <td>{method.type}</td>
              <td>{method.description}</td>
              <td><AdminBadge value={method.active} /></td>
              <td>
                <div className="admin-row-actions">
                  <button className="admin-icon-action" type="button" title="Editar metodo" aria-label={`Editar metodo ${method.name}`}><Pencil size={17} /></button>
                </div>
              </td>
            </tr>
          ))}
          {visibleMethods.length === 0 ? <tr><td colSpan={5} className="admin-muted">No hay metodos para este filtro.</td></tr> : null}
        </AdminTable>
      </AdminModuleSurface>
    </div>
  );
}
