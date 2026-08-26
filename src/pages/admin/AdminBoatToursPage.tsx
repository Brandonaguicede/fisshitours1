import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { money } from './adminMockData';

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
// source of truth for commercial terms; editing happens exclusively from the "Paquetes"
// tab inside each tour (Tours > editar tour > Paquetes) to avoid two divergent editors
// writing the same rows.
export default function AdminBoatToursPage() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatFilter, setBoatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    const [packagesRes, boatsRes] = await Promise.all([
      supabase
        .from('tour_packages')
        .select('id, name, base_price, included_guests, max_guests, custom_quote, active, sort_order, boat_tours(boat_id, tour_id, boats(name), tours(title))')
        .order('sort_order'),
      supabase.from('boats').select('id, name').order('sort_order'),
    ]);
    setLoading(false);
    if (packagesRes.error || boatsRes.error) {
      setError(packagesRes.error?.message ?? boatsRes.error?.message ?? 'No se pudieron cargar los paquetes.');
      return;
    }
    setPackages((packagesRes.data ?? []) as unknown as PackageRow[]);
    setBoats((boatsRes.data ?? []) as BoatOption[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const visiblePackages = useMemo(
    () => packages.filter((item) => boatFilter === 'all' || item.boat_tours?.boat_id === boatFilter),
    [packages, boatFilter],
  );

  function editInTour(item: PackageRow) {
    const tourId = item.boat_tours?.tour_id;
    if (!tourId) return;
    navigate(`/admin/tours?tourId=${tourId}&tab=packages`);
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Paquetes (todos los tours)" description="Vista de solo lectura de todos los paquetes reservables. Para crear o editar, entra al tour correspondiente y usa su pestana Paquetes." />
      <AdminToolbar>
        <select className="admin-select" value={boatFilter} onChange={(event) => setBoatFilter(event.target.value)}>
          <option value="all">Todos los botes</option>
          {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
        </select>
      </AdminToolbar>
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando paquetes...</p>
      ) : (
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
                <button className="admin-btn admin-btn--ghost" type="button" onClick={() => editInTour(item)}><Pencil size={14} /> Editar en el tour</button>
              </td>
            </tr>
          ))}
          {visiblePackages.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay paquetes.</td></tr> : null}
        </AdminTable>
      )}
    </div>
  );
}
