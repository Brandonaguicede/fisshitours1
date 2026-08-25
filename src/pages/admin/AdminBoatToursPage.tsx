import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import type { StorageImage } from '../../services/imageService';
import { money } from './adminMockData';

interface BoatOption { id: string; name: string }
interface BoatTourOption { id: string; boat_id: string; tour_id: string }

interface PackageRow {
  id: string;
  boat_tour_id: string;
  name: string;
  package_type: string;
  description: string | null;
  duration_minutes: number | null;
  base_price: number;
  included_guests: number;
  max_guests: number;
  extra_guest_price: number;
  custom_quote: boolean;
  image_url: string | null;
  image_public_id: string | null;
  active: boolean;
  sort_order: number;
  boat_tours?: { boat_id: string; tour_id: string; boats?: { name: string } | null; tours?: { title: string } | null } | null;
}

export default function AdminBoatToursPage() {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [boats, setBoats] = useState<BoatOption[]>([]);
  const [boatTours, setBoatTours] = useState<BoatTourOption[]>([]);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [boatFilter, setBoatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    const [packagesRes, boatsRes, boatToursRes] = await Promise.all([
      supabase
        .from('tour_packages')
        .select('*, boat_tours(boat_id, tour_id, boats(name), tours(title))')
        .order('sort_order'),
      supabase.from('boats').select('id, name').order('sort_order'),
      supabase.from('boat_tours').select('id, boat_id, tour_id').eq('active', true).order('sort_order'),
    ]);
    setLoading(false);
    if (packagesRes.error || boatsRes.error || boatToursRes.error) {
      setError(packagesRes.error?.message ?? boatsRes.error?.message ?? boatToursRes.error?.message ?? 'No se pudieron cargar los paquetes.');
      return;
    }
    setPackages((packagesRes.data ?? []) as unknown as PackageRow[]);
    setBoats((boatsRes.data ?? []) as BoatOption[]);
    setBoatTours((boatToursRes.data ?? []) as BoatTourOption[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createPackage() {
    const firstBoatTour = boatTours[0];
    if (!firstBoatTour) {
      setError('');
      setNotice('Crea primero un tour y una asociacion bote-tour activa antes de crear paquetes.');
      return;
    }
    const id = `package-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await supabase
      .from('tour_packages')
      .insert({
        id,
        boat_tour_id: firstBoatTour.id,
        name: 'Nuevo paquete',
        package_type: 'half_day',
        base_price: 0,
        included_guests: 5,
        max_guests: 10,
        extra_guest_price: 65,
        custom_quote: false,
        active: true,
        sort_order: packages.length + 1,
      })
      .select('*, boat_tours(boat_id, tour_id, boats(name), tours(title))')
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(data as unknown as PackageRow);
    await loadData();
  }

  async function savePackage() {
    if (!editing) return;
    if (editing.base_price < 0 || editing.included_guests < 1 || editing.max_guests < editing.included_guests || editing.extra_guest_price < 0) {
      setError('Revisa los valores: precio base >= 0, incluidos >= 1, maximo >= incluidos y precio adicional >= 0.');
      return;
    }
    if (editing.boat_tours?.boat_id === 'segundo-viento' && editing.max_guests > 10) {
      setError('Second Wind no puede superar 10 pasajeros.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase
      .from('tour_packages')
      .update({
        boat_tour_id: editing.boat_tour_id,
        name: editing.name,
        package_type: editing.package_type,
        description: editing.description,
        duration_minutes: editing.duration_minutes,
        base_price: editing.base_price,
        included_guests: editing.included_guests,
        max_guests: editing.max_guests,
        extra_guest_price: editing.extra_guest_price,
        custom_quote: editing.custom_quote,
        active: editing.active,
        sort_order: editing.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Paquete actualizado.');
    await loadData();
  }

  async function onImageSaved(image: StorageImage) {
    if (!editing) return;
    const { error } = await supabase
      .from('tour_packages')
      .update({ image_url: image.public_url, image_public_id: image.storage_path, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) throw new Error(error.message);
    setEditing({ ...editing, image_url: image.public_url, image_public_id: image.storage_path });
    await loadData();
  }

  const visiblePackages = useMemo(
    () => packages.filter((item) => boatFilter === 'all' || item.boat_tours?.boat_id === boatFilter),
    [packages, boatFilter],
  );

  return (
    <div className="admin-page">
      <AdminPageHeader title="Paquetes por bote" description="Paquetes reservables, capacidades y precios reales." actions={<button className="admin-btn" type="button" onClick={() => void createPackage()}><Plus size={16} /> Crear paquete</button>} />
      <AdminToolbar>
        <select className="admin-select" value={boatFilter} onChange={(event) => setBoatFilter(event.target.value)}>
          <option value="all">Todos los botes</option>
          {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
        </select>
      </AdminToolbar>
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
      {!loading && boatTours.length === 0 ? (
        <section className="admin-card">
          <h2 className="admin-card__title">No hay asociaciones bote-tour activas</h2>
          <p className="admin-muted">Primero crea el tour base. Luego asocialo con un bote y vuelve para crear paquetes reservables.</p>
          <div className="admin-image-manager__actions mt-4">
            <a className="admin-btn" href="/admin/tours"><Plus size={16} /> Crear tour</a>
            <a className="admin-btn admin-btn--secondary" href="/admin/boat-tours"><Plus size={16} /> Asociar tour con barco</a>
          </div>
        </section>
      ) : null}
      {loading ? (
        <p className="admin-muted">Cargando paquetes...</p>
      ) : boatTours.length > 0 ? (
        <AdminTable headers={['Paquete', 'Bote', 'Tour', 'Precio base', 'Capacidad', 'Orden', 'Estado', 'Acciones']}>
          {visiblePackages.map((item) => (
            <tr key={item.id}>
              <td>{item.name}<div className="admin-muted">{item.id}</div></td>
              <td>{item.boat_tours?.boats?.name ?? item.boat_tours?.boat_id ?? '-'}</td>
              <td>{item.boat_tours?.tours?.title ?? item.boat_tours?.tour_id ?? '-'}</td>
              <td>{item.custom_quote ? 'Cotizar' : money(Number(item.base_price))}</td>
              <td>{item.included_guests} incluidos / {item.max_guests} max</td>
              <td>{item.sort_order}</td>
              <td><AdminBadge value={item.active} /></td>
              <td><button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(item)}><Pencil size={14} /> Editar</button></td>
            </tr>
          ))}
          {visiblePackages.length === 0 ? <tr><td colSpan={8} className="admin-muted">No hay paquetes.</td></tr> : null}
        </AdminTable>
      ) : null}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} titleId="package-edit-title" className="max-w-2xl">
        {editing ? (
          <div className="admin-modal-shell">
            <header className="admin-modal-header">
              <h2 id="package-edit-title" className="admin-card__title"><Pencil size={18} /> Editar paquete</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button>
            </header>
            <div className="admin-modal-body">
              <AdminImageManager
                resourceTable="tour_packages"
                resourceId={editing.id}
                folder="tours"
                currentImageUrl={editing.image_url}
                currentStoragePath={editing.image_public_id}
                label={editing.name}
                aspect={3 / 2}
                maxWidth={1200}
                maxHeight={800}
                maxSizeMB={0.35}
                requireReplacementToDelete
                onImageSaved={onImageSaved}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1"><span className="admin-muted">Bote y tour asociados</span><select className="admin-select" value={editing.boat_tour_id} onChange={(event) => setEditing({ ...editing, boat_tour_id: event.target.value })}>{boatTours.map((item) => <option key={item.id} value={item.id}>{item.boat_id} / {item.tour_id}</option>)}</select></label>
                <label className="grid gap-1"><span className="admin-muted">Nombre</span><input className="admin-input" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Half Day, 3/4 Day, Full Day, Classic o Deluxe</span><input className="admin-input" value={editing.package_type} onChange={(event) => setEditing({ ...editing, package_type: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Duracion en minutos (vacío si pendiente)</span><input className="admin-input" type="number" min={1} value={editing.duration_minutes ?? ''} onChange={(event) => setEditing({ ...editing, duration_minutes: event.target.value ? Number(event.target.value) : null })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Precio base del bote</span><input className="admin-input" type="number" min={0} value={editing.base_price} onChange={(event) => setEditing({ ...editing, base_price: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Precio por persona adicional</span><input className="admin-input" type="number" min={0} value={editing.extra_guest_price} onChange={(event) => setEditing({ ...editing, extra_guest_price: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Incluye hasta 5 personas</span><input className="admin-input" type="number" min={1} value={editing.included_guests} onChange={(event) => setEditing({ ...editing, included_guests: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Capacidad máxima</span><input className="admin-input" type="number" min={1} max={10} value={editing.max_guests} onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Orden</span><input className="admin-input" type="number" value={editing.sort_order} onChange={(event) => setEditing({ ...editing, sort_order: Number(event.target.value) })} /></label>
              </div>
              <label className="grid gap-1"><span className="admin-muted">Descripcion</span><textarea className="admin-input" value={editing.description ?? ''} onChange={(event) => setEditing({ ...editing, description: event.target.value || null })} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.custom_quote} onChange={(event) => setEditing({ ...editing, custom_quote: event.target.checked })} /><span className="admin-muted">Cotizar manualmente</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span className="admin-muted">Activo</span></label>
            </div>
            <ModalFooter>
              <button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditing(null)}>Cerrar</button>
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void savePackage()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </ModalFooter>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
