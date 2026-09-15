import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { money } from './adminMockData';
import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { getAdminTablePage } from '../../services/adminListService';
import { readWithAdminSession } from '../../services/adminAuthService';

interface BoatOption { id: string; name: string }

interface PackageRow {
  id: string;
  name: string;
  base_price: number;
  included_guests: number;
  max_guests: number;
  custom_quote: boolean;
  active: boolean;
  sort_order: number;
  boat_tours?: { boat_id: string; tour_id: string; boats?: { name: string } | null; tours?: { title: string } | null } | null;
}

// Read-only overview across every tour + boat combination. tour_packages is the single
// source of truth for commercial terms; editing happens exclusively from the
// "Tours y paquetes" tab inside each boat (Botes > editar bote > Tours y paquetes) so a
// package can never be reassigned to another boat.
export default function AdminBoatToursPage() {
  const navigate = useNavigate();
  const [boatFilter, setBoatFilter] = useState('all');
  const boatsQuery = useQuery({
    queryKey: ['admin', 'packageBoats'],
    queryFn: () => readWithAdminSession(() => supabase.from('boats').select('id, name').order('sort_order')),
  });
  const boats = (boatsQuery.data ?? []) as BoatOption[];
  const pagination = useAdminPagedList<PackageRow>('packages', boatFilter, (page, size) => getAdminTablePage(() => {
    const relation = boatFilter === 'all' ? 'boat_tours' : 'boat_tours!inner';
    let query = (supabase as any).from('tour_packages')
      .select(`id, name, base_price, included_guests, max_guests, custom_quote, active, sort_order, ${relation}(boat_id, tour_id, boats(name), tours(title))`, { count: 'exact' })
      .order('sort_order').order('id');
    if (boatFilter !== 'all') query = query.eq('boat_tours.boat_id', boatFilter);
    return query;
  }, page, size));
  const visiblePackages = pagination.rows;
  const loading = pagination.query.isFetching;
  const error = (pagination.query.error ?? boatsQuery.error) instanceof Error ? (pagination.query.error ?? boatsQuery.error)?.message : '';

  function editInTour(item: PackageRow) {
    const boatId = item.boat_tours?.boat_id;
    if (!boatId) return;
    navigate(`/admin/boats?boatId=${boatId}`);
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Paquetes (todos los tours)" description="Vista de solo lectura de todos los paquetes reservables. Para crear o editar, entra al bote correspondiente y usa su pestana Tours y paquetes." />
      <AdminToolbar>
        <select className="admin-select" value={boatFilter} onChange={(event) => setBoatFilter(event.target.value)}>
          <option value="all">Todos los botes</option>
          {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
        </select>
      </AdminToolbar>
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}

      {loading ? <p className="admin-muted" role="status">Cargando paquetes...</p> : null}
      <div aria-busy={loading}>
        <AdminTable headers={['Paquete', 'Bote', 'Tour', 'Precio base', 'Capacidad', 'Estado', 'Acciones']}>
          {visiblePackages.map((item) => (
            <tr key={item.id}>
              <td>{item.name}<div className="admin-muted">{item.id}</div></td>
              <td>{item.boat_tours?.boats?.name ?? item.boat_tours?.boat_id ?? '-'}</td>
              <td>{item.boat_tours?.tours?.title ?? item.boat_tours?.tour_id ?? '-'}</td>
              <td>{item.custom_quote ? 'Cotizar' : money(Number(item.base_price))}</td>
              <td>{item.included_guests} incluidos / {item.max_guests} max</td>
              <td><AdminBadge value={item.active} /></td>
              <td>
                <button className="admin-btn admin-btn--ghost" type="button" disabled={loading} onClick={() => editInTour(item)}><Pencil size={14} /> Editar en el bote</button>
              </td>
            </tr>
          ))}
          {!loading && !error && visiblePackages.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay paquetes para este filtro.</td></tr> : null}
        </AdminTable>
      </div>
      <AdminPagination {...pagination} noun="paquetes" loading={loading} />
    </div>
  );
}
