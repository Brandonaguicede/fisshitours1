import { EyeOff, Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';

type PaymentMethodRow = Tables<'payment_methods'>;
type StatusFilter = 'all' | 'active' | 'inactive';

// CIERRE DE SEGURIDAD pass: this screen used to be a full CRUD (create,
// rename, retype, re-key, delete) over `payment_methods`. `key` is the FK
// `bookings.payment_method_key` points at and `type` selects which checkout
// integration runs (BookingPanel.tsx) — editing either from here could
// silently break checkout or orphan historical reservations. Admin is now
// read + the one safe mutation: toggling `active`, which only controls
// whether a method is offered on new bookings. Nothing about the
// payment_methods table, its RLS, or the checkout handlers changed.
export default function AdminPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  async function loadMethods() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order');
    setLoading(false);
    if (error) {
      setError(error.message);
      setMethods([]);
      return;
    }
    setMethods((data ?? []) as PaymentMethodRow[]);
  }

  useEffect(() => {
    void loadMethods();
  }, []);

  const visibleMethods = useMemo(
    () => methods
      .filter((method) => statusFilter === 'all' || (statusFilter === 'active') === method.active)
      .filter((method) => `${method.name} ${method.description ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [methods, search, statusFilter],
  );

  async function toggleActive(method: PaymentMethodRow) {
    setTogglingKey(method.key);
    setError('');
    setNotice('');
    // The only field this screen may ever write is `active` — every other
    // column (key, type, name, instructions, logo_url, sort_order) stays
    // exactly as it is in the database.
    const { error } = await supabase.from('payment_methods').update({ active: !method.active }).eq('key', method.key);
    setTogglingKey(null);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(method.active ? `${method.name} desactivado: ya no aparecerá para nuevas reservas.` : `${method.name} activado.`);
    await loadMethods();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Metodos de pago" description="Activa o desactiva cada metodo. La integracion (PayPal, WhatsApp, pago el dia del tour) la controla el sistema." />
      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar metodo por nombre o descripcion"
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
        />
        {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
        {loading ? (
          <p className="admin-muted">Cargando metodos...</p>
        ) : (
          <AdminTable embedded headers={['Metodo', 'Descripcion', 'Estado', 'Acciones']}>
            {visibleMethods.map((method) => (
              <tr key={method.id}>
                <td>{method.name}</td>
                <td>{method.description ?? '-'}</td>
                <td><AdminBadge value={method.active} /></td>
                <td>
                  <div className="admin-row-actions">
                    <button
                      className="admin-icon-action"
                      type="button"
                      disabled={togglingKey === method.key}
                      title={method.active ? 'Desactivar metodo' : 'Activar metodo'}
                      aria-label={method.active ? `Desactivar ${method.name}` : `Activar ${method.name}`}
                      onClick={() => void toggleActive(method)}
                    >
                      {method.active ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleMethods.length === 0 ? <tr><td colSpan={4} className="admin-muted">No hay metodos para este filtro.</td></tr> : null}
          </AdminTable>
        )}
      </AdminModuleSurface>
    </div>
  );
}
