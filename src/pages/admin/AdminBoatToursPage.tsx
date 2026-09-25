import { Download, Eye, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import PackageDetailModal, { formatDuration, packageDisplayName, packageEditPath, type PackageDetail } from '../../components/admin/PackageDetailModal';
import { supabase } from '../../lib/supabase';
import { money } from '../../utils/format';
import { createPackagesPdf, loadLogoDataUrl, packagesPdfFileName, type PackagePdfRow } from '../../utils/packagesPdf';
import AdminPagination from '../../components/admin/AdminPagination';
import { useAdminPagedList } from '../../hooks/useAdminPagedList';
import { getAdminTablePage } from '../../services/adminListService';
import { readWithAdminSession } from '../../services/adminAuthService';

interface BoatOption { id: string; name: string }
interface TourOption { id: string; title: string }

type StatusFilter = 'all' | 'active' | 'inactive';

// Everything the table, the detail modal and the PDF need, in one query (no per-row requests).
const PACKAGE_COLUMNS = 'id, name, name_en, name_es, description, description_en, description_es, duration_minutes, base_price, included_guests, max_guests, extra_guest_price, custom_quote, active, sort_order, departure_times, meal_options, package_included, package_included_en, package_included_es';
const PDF_ROW_LIMIT = 2000;

// "Resumen de paquetes": a READ-ONLY overview across every tour + boat combination. This page never writes.
// tour_packages is the single source of truth for commercial terms; creating and editing happens exclusively in
// Botes > editar bote > Tours y paquetes. "Ver detalles" opens a read-only modal whose only action besides closing
// is a link to the exact package in that editor.
export default function AdminBoatToursPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [boatFilter, setBoatFilter] = useState('all');
  const [tourFilter, setTourFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<PackageDetail | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
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

  // The same filtered query feeds the table (paged) and the PDF (all matching rows).
  function buildQuery(withCount: boolean) {
    const needsInnerJoin = boatFilter !== 'all' || tourFilter !== 'all';
    const relation = needsInnerJoin ? 'boat_tours!inner' : 'boat_tours';
    let query = (supabase as any).from('tour_packages')
      .select(`${PACKAGE_COLUMNS}, ${relation}(boat_id, tour_id, boats(name), tours(title, title_en, included, included_en))`, withCount ? { count: 'exact' } : undefined)
      .order('sort_order').order('id');
    if (boatFilter !== 'all') query = query.eq('boat_tours.boat_id', boatFilter);
    if (tourFilter !== 'all') query = query.eq('boat_tours.tour_id', tourFilter);
    if (statusFilter !== 'all') query = query.eq('active', statusFilter === 'active');
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    return query;
  }

  const pagination = useAdminPagedList<PackageDetail>('packages', filterKey, (page, size) => getAdminTablePage(() => buildQuery(true), page, size));
  const visiblePackages = pagination.rows;
  const loading = pagination.query.isFetching;
  const error = (pagination.query.error ?? boatsQuery.error ?? toursQuery.error) instanceof Error ? (pagination.query.error ?? boatsQuery.error ?? toursQuery.error)?.message : '';

  function editInBoats(item: PackageDetail) {
    if (!item.boat_tours?.boat_id) return;
    setSelected(null);
    navigate(packageEditPath(item));
  }

  function resetFilters() {
    setBoatFilter('all');
    setTourFilter('all');
    setStatusFilter('all');
  }

  function activeFilterLabels() {
    const labels: string[] = [];
    if (boatFilter !== 'all') labels.push(`Bote: ${boats.find((boat) => boat.id === boatFilter)?.name ?? boatFilter}`);
    if (tourFilter !== 'all') labels.push(`Tour: ${tours.find((tour) => tour.id === tourFilter)?.title ?? tourFilter}`);
    if (statusFilter !== 'all') labels.push(`Estado: ${statusFilter === 'active' ? 'Activos' : 'Inactivos'}`);
    if (search.trim()) labels.push(`Búsqueda: "${search.trim()}"`);
    return labels;
  }

  // Exports exactly what the admin is consulting: current search + filters, all pages (not just the visible one).
  async function exportPdf() {
    setExporting(true);
    setExportError('');
    try {
      const rows = (await readWithAdminSession(() => buildQuery(false).limit(PDF_ROW_LIMIT))) as PackageDetail[] | null;
      const pdfRows: PackagePdfRow[] = (rows ?? []).map((item) => ({
        name: packageDisplayName(item),
        boat: item.boat_tours?.boats?.name ?? '-',
        tour: item.boat_tours?.tours?.title ?? '-',
        price: item.custom_quote ? 'Cotizar' : money(Number(item.base_price)),
        capacity: `${item.included_guests} / ${item.max_guests}`,
        duration: formatDuration(item.duration_minutes),
        status: item.active ? 'Activo' : 'Inactivo',
      }));
      const doc = await createPackagesPdf({ rows: pdfRows, filters: activeFilterLabels(), logoDataUrl: await loadLogoDataUrl() });
      doc.save(packagesPdfFileName());
    } catch (caught) {
      setExportError(caught instanceof Error ? `No se pudo generar el PDF: ${caught.message}` : 'No se pudo generar el PDF.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Resumen de paquetes" description="Consulta general de los paquetes configurados por bote y tour. Para crear o modificar paquetes, entra al bote correspondiente." />
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
          secondaryActions={
            <button className="admin-btn admin-btn--secondary" type="button" disabled={exporting || loading || Boolean(error)} onClick={() => void exportPdf()} title="Descarga en PDF los paquetes que ves con la búsqueda y los filtros actuales">
              {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} {exporting ? 'Generando PDF...' : 'Descargar PDF'}
            </button>
          }
        />
        {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {exportError ? <div className="admin-alert admin-alert--danger" role="alert">{exportError}</div> : null}

        {loading ? <p className="admin-muted" role="status">Cargando paquetes...</p> : null}
        <div aria-busy={loading}>
          <AdminTable embedded headers={['Paquete', 'Bote', 'Tour', 'Precio base', 'Capacidad', 'Estado', 'Acciones']}>
            {visiblePackages.map((item) => (
              <tr key={item.id}>
                <td><strong>{packageDisplayName(item)}</strong></td>
                <td>{item.boat_tours?.boats?.name ?? item.boat_tours?.boat_id ?? '-'}</td>
                <td>{item.boat_tours?.tours?.title ?? item.boat_tours?.tour_id ?? '-'}</td>
                <td>{item.custom_quote ? 'Cotizar' : money(Number(item.base_price))}</td>
                <td>{item.included_guests} incluidos / {item.max_guests} max</td>
                <td><AdminBadge value={item.active} /></td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-action-btn" type="button" disabled={loading} title="Ver el detalle de este paquete (solo lectura)" aria-label={`Ver detalles del paquete ${packageDisplayName(item)}`} onClick={() => setSelected(item)}><Eye size={14} /> Ver detalles</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !error && visiblePackages.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay paquetes para este filtro.</td></tr> : null}
          </AdminTable>
        </div>
        <AdminPagination {...pagination} noun="paquetes" loading={loading} />
      </AdminModuleSurface>

      <PackageDetailModal item={selected} onClose={() => setSelected(null)} onEdit={editInBoats} />
    </div>
  );
}
