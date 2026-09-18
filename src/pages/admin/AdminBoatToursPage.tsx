import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { money } from '../../utils/format';
import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { getAdminTablePage } from '../../services/adminListService';
import { readWithAdminSession } from '../../services/adminAuthService';

interface BoatOption { id: string; name: string }
interface TourOption { id: string; title: string }

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

type StatusFilter = 'all' | 'active' | 'inactive';

// Read-only overview across every tour + boat combination. tour_packages is the single
// source of truth for commercial terms; editing happens exclusively from the
// "Tours y paquetes" tab inside each boat (Botes > editar bote > Tours y paquetes) so a
// package can never be reassigned to another boat.
export default function AdminBoatToursPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [boatFilter, setBoatFilter] = useState('all');
  const [tourFilter, setTourFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const boatsQuery = useQuery({
    queryKey: ['admin', 'packageBoats'],
    queryFn: () => readWithAdminSession(() => supabase.from('boats').select('id, name').order('sort_order')),
  });
  const toursQuery = useQuery({
    queryKey: ['admin', 'packageTours'],
    queryFn: () => readWithAdminSession(() => supabase.from('tours').select('id, title').order('sort_order')),
  });
  const boats = (boatsQuery.data ?? []) as BoatOption[];
  const tours = (toursQuery.data ?? []) as TourOption[];
  const activeFilterCount = Number(boatFilter !== 'all') + Number(tourFilter !== 'all') + Number(statusFilter !== 'all');
  const filterKey = `${boatFilter}|${tourFilter}|${statusFilter}|${search}`;
  const pagination = useAdminPagedList<PackageRow>('packages', filterKey, (page, size) => getAdminTablePage(() => {
    const needsInnerJoin = boatFilter !== 'all' || tourFilter !== 'all';
    const relation = needsInnerJoin ? 'boat_tours!inner' : 'boat_tours';
    let query = (supabase as any).from('tour_packages')
      .select(`id, name, base_price, included_guests, max_guests, custom_quote, active, sort_order, ${relation}(boat_id, tour_id, boats(name), tours(title))`, { count: 'exact' })
      .order('sort_order').order('id');
    if (boatFilter !== 'all') query = query.eq('boat_tours.boat_id', boatFilter);
    if (tourFilter !== 'all') query = query.eq('boat_tours.tour_id', tourFilter);
    if (statusFilter !== 'all') query = query.eq('active', statusFilter === 'active');
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    return query;
  }, page, size));
  const visiblePackages = pagination.rows;
  const loading = pagination.query.isFetching;
  const error = (pagination.query.error ?? boatsQuery.error ?? toursQuery.error) instanceof Error ? (pagination.query.error ?? boatsQuery.error ?? toursQuery.error)?.message : '';

  function editInTour(item: PackageRow) {
    const boatId = item.boat_tours?.boat_id;
    if (!boatId) return;
    navigate(`/admin/boats?boatId=${boatId}`);
  }

  function resetFilters() {
    setBoatFilter('all');
    setTourFilter('all');
    setStatusFilter('all');
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Paquetes (todos los tours)" description="Vista de solo lectura de todos los paquetes reservables. Para crear o editar, entra al bote correspondiente y usa su pestana Tours y paquetes." />
      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar paquetes por nombre"
          filters={
            <AdminFilterMenu panelLabel="Filtros de paquetes" panelDescription="Refina la lista de paquetes." activeCount={activeFilterCount} onReset={resetFilters}>
              <label className="admin-field">
                <span className="admin-field__label">Bote</span>
                <select className="admin-select" value={boatFilter} onChange={(event) => setBoatFilter(event.target.value)}>
                  <option value="all">Todos los botes</option>
                  {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Tour</span>
                <select className="admin-select" value={tourFilter} onChange={(event) => setTourFilter(event.target.value)}>
                  <option value="all">Todos los tours</option>
                  {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.title}</option>)}
                </select>
              </label>
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

        {loading ? <p className="admin-muted" role="status">Cargando paquetes...</p> : null}
        <div aria-busy={loading}>
          <AdminTable embedded headers={['Paquete', 'Bote', 'Tour', 'Precio base', 'Capacidad', 'Estado', 'Acciones']}>
            {visiblePackages.map((item) => (
              <tr key={item.id}>
                <td>{item.name}<div className="admin-muted">{item.id}</div></td>
                <td>{item.boat_tours?.boats?.name ?? item.boat_tours?.boat_id ?? '-'}</td>
                <td>{item.boat_tours?.tours?.title ?? item.boat_tours?.tour_id ?? '-'}</td>
                <td>{item.custom_quote ? 'Cotizar' : money(Number(item.base_price))}</td>
                <td>{item.included_guests} incluidos / {item.max_guests} max</td>
                <td><AdminBadge value={item.active} /></td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-icon-action" type="button" disabled={loading} title={`Editar en el bote — ${item.name}`} aria-label={`Editar paquete ${item.name} en el bote`} onClick={() => editInTour(item)}><Pencil size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !error && visiblePackages.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay paquetes para este filtro.</td></tr> : null}
          </AdminTable>
        </div>
        <AdminPagination {...pagination} noun="paquetes" loading={loading} />
      </AdminModuleSurface>
    </div>
  );
}
