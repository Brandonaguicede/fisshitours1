import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage, type StorageImage } from '../../services/imageService';
import { money } from './adminMockData';

interface BoatOption { id: string; name: string }
interface TourOption { id: string; title: string }
interface BoatTourOption { id: string; boat_id: string; tour_id: string; boats?: { name: string } | null; tours?: { title: string } | null }

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
  const [tours, setTours] = useState<TourOption[]>([]);
  const [boatTours, setBoatTours] = useState<BoatTourOption[]>([]);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PackageRow | null>(null);
  const [boatFilter, setBoatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    const [packagesRes, boatsRes, toursRes, boatToursRes] = await Promise.all([
      supabase
        .from('tour_packages')
        .select('*, boat_tours(boat_id, tour_id, boats(name), tours(title))')
        .order('sort_order'),
      supabase.from('boats').select('id, name').order('sort_order'),
      supabase.from('tours').select('id, title').order('sort_order'),
      supabase.from('boat_tours').select('id, boat_id, tour_id, boats(name), tours(title)').eq('active', true).order('sort_order'),
    ]);
    setLoading(false);
    if (packagesRes.error || boatsRes.error || toursRes.error || boatToursRes.error) {
      setError(packagesRes.error?.message ?? boatsRes.error?.message ?? toursRes.error?.message ?? boatToursRes.error?.message ?? 'No se pudieron cargar los paquetes.');
      return;
    }
    setPackages((packagesRes.data ?? []) as unknown as PackageRow[]);
    setBoats((boatsRes.data ?? []) as BoatOption[]);
    setTours((toursRes.data ?? []) as TourOption[]);
    setBoatTours((boatToursRes.data ?? []) as BoatTourOption[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createPackage() {
    const firstBoat = boats[0];
    const firstTour = tours[0];
    if (!firstBoat || !firstTour) {
      setError('');
      setNotice('Crea primero al menos un bote y un tour base antes de crear paquetes.');
      return;
    }
    const firstBoatTour = boatTours.find((item) => item.boat_id === firstBoat.id && item.tour_id === firstTour.id);
    const id = `package-${crypto.randomUUID().slice(0, 8)}`;
    setError('');
    setNotice('');
    setEditing({
      id,
      boat_tour_id: firstBoatTour?.id ?? '',
      name: 'Nuevo paquete',
      package_type: 'half_day',
      description: null,
      duration_minutes: null,
      base_price: 0,
      included_guests: 5,
      max_guests: 10,
      extra_guest_price: 65,
      custom_quote: false,
      image_url: null,
      image_public_id: null,
      active: true,
      sort_order: packages.length + 1,
      boat_tours: {
        boat_id: firstBoat.id,
        tour_id: firstTour.id,
        boats: { name: firstBoat.name },
        tours: { title: firstTour.title },
      },
    });
  }

  async function savePackage() {
    if (!editing) return;
    if (editing.base_price < 0 || editing.included_guests < 1 || editing.max_guests < editing.included_guests || editing.extra_guest_price < 0) {
      setError('Revisa los valores: precio base >= 0, incluidos >= 1, maximo >= incluidos y precio adicional >= 0.');
      return;
    }
    const selectedBoatId = editing.boat_tours?.boat_id;
    const selectedTourId = editing.boat_tours?.tour_id;
    if (!selectedBoatId || !selectedTourId) {
      setError('Selecciona un bote y un tour para este paquete.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');

    const existingBoatTour = boatTours.find((item) => item.boat_id === selectedBoatId && item.tour_id === selectedTourId);
    let boatTourId = existingBoatTour?.id ?? editing.boat_tour_id;
    if (!existingBoatTour) {
      const { data: createdBoatTour, error: boatTourError } = await supabase
        .from('boat_tours')
        .insert({
          boat_id: selectedBoatId,
          tour_id: selectedTourId,
          active: true,
          sort_order: boatTours.length + 1,
        })
        .select('id')
        .single();

      if (boatTourError) {
        setSaving(false);
        setError(boatTourError.message);
        return;
      }
      boatTourId = createdBoatTour.id;
    }

    const { error } = await supabase
      .from('tour_packages')
      .upsert({
        id: editing.id,
        boat_tour_id: boatTourId,
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
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Paquete guardado.');
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

  async function deletePackage(pkg: PackageRow) {
    setSaving(true);
    setError('');
    setNotice('');
    const { error } = await supabase.from('tour_packages').delete().eq('id', pkg.id);
    if (error) {
      setSaving(false);
      setPendingDelete(null);
      setError(`${error.message}. Si el paquete tiene reservas historicas, desactivalo en lugar de eliminarlo.`);
      return;
    }
    if (pkg.image_public_id) {
      try {
        await deleteStorageImage({ storagePath: pkg.image_public_id, resourceTable: 'tour_packages', resourceId: pkg.id });
      } catch {
        // The database row is already gone; storage cleanup can be retried separately if needed.
      }
    }
    setSaving(false);
    setPendingDelete(null);
    setNotice('Paquete eliminado.');
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
      {!loading && (boats.length === 0 || tours.length === 0) ? (
        <section className="admin-card">
          <h2 className="admin-card__title">Faltan botes o tours base</h2>
          <p className="admin-muted">Primero crea al menos un bote y un tour. Despues puedes crear paquetes para cualquier combinacion bote-tour desde este panel.</p>
          <div className="admin-image-manager__actions mt-4">
            <a className="admin-btn" href="/admin/tours"><Plus size={16} /> Crear tour</a>
            <a className="admin-btn admin-btn--secondary" href="/admin/boats"><Plus size={16} /> Crear bote</a>
          </div>
        </section>
      ) : null}
      {loading ? (
        <p className="admin-muted">Cargando paquetes...</p>
      ) : boats.length > 0 && tours.length > 0 ? (
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
              <td>
                <div className="admin-actions">
                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setEditing(item)}><Pencil size={14} /> Editar</button>
                  <button className="admin-btn admin-btn--danger" type="button" onClick={() => setPendingDelete(item)}><Trash2 size={14} /> Eliminar</button>
                </div>
              </td>
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
              {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
              {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}
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
                <label className="grid gap-1">
                  <span className="admin-muted">Bote</span>
                  <select
                    className="admin-select"
                    value={editing.boat_tours?.boat_id ?? ''}
                    onChange={(event) => {
                      const boat = boats.find((item) => item.id === event.target.value);
                      const tourId = editing.boat_tours?.tour_id ?? tours[0]?.id ?? '';
                      const tour = tours.find((item) => item.id === tourId);
                      const match = boatTours.find((item) => item.boat_id === event.target.value && item.tour_id === tourId);
                      setEditing({
                        ...editing,
                        boat_tour_id: match?.id ?? '',
                        boat_tours: {
                          boat_id: event.target.value,
                          tour_id: tourId,
                          boats: boat ? { name: boat.name } : null,
                          tours: tour ? { title: tour.title } : null,
                        },
                      });
                    }}
                  >
                    {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="admin-muted">Tour</span>
                  <select
                    className="admin-select"
                    value={editing.boat_tours?.tour_id ?? ''}
                    onChange={(event) => {
                      const tour = tours.find((item) => item.id === event.target.value);
                      const boatId = editing.boat_tours?.boat_id ?? boats[0]?.id ?? '';
                      const boat = boats.find((item) => item.id === boatId);
                      const match = boatTours.find((item) => item.boat_id === boatId && item.tour_id === event.target.value);
                      setEditing({
                        ...editing,
                        boat_tour_id: match?.id ?? '',
                        boat_tours: {
                          boat_id: boatId,
                          tour_id: event.target.value,
                          boats: boat ? { name: boat.name } : null,
                          tours: tour ? { title: tour.title } : null,
                        },
                      });
                    }}
                  >
                    {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.title}</option>)}
                  </select>
                </label>
                <label className="grid gap-1"><span className="admin-muted">Nombre</span><input className="admin-input" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Half Day, 3/4 Day, Full Day, Classic o Deluxe</span><input className="admin-input" value={editing.package_type} onChange={(event) => setEditing({ ...editing, package_type: event.target.value })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Duracion en minutos (vacío si pendiente)</span><input className="admin-input" type="number" min={1} value={editing.duration_minutes ?? ''} onChange={(event) => setEditing({ ...editing, duration_minutes: event.target.value ? Number(event.target.value) : null })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Precio base del bote</span><input className="admin-input" type="number" min={0} value={editing.base_price} onChange={(event) => setEditing({ ...editing, base_price: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Precio por persona adicional</span><input className="admin-input" type="number" min={0} value={editing.extra_guest_price} onChange={(event) => setEditing({ ...editing, extra_guest_price: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Incluye hasta 5 personas</span><input className="admin-input" type="number" min={1} value={editing.included_guests} onChange={(event) => setEditing({ ...editing, included_guests: Number(event.target.value) })} /></label>
                <label className="grid gap-1"><span className="admin-muted">Capacidad maxima</span><input className="admin-input" type="number" min={1} value={editing.max_guests} onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })} /></label>
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

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} titleId="package-delete-title" className="max-w-md">
        {pendingDelete ? (
          <div className="admin-modal-card">
            <h2 id="package-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar paquete</h2>
            <p className="admin-muted mt-2">Esta accion elimina el paquete. Si tiene reservas historicas, la base de datos puede bloquear la eliminacion.</p>
            <p className="mt-3 font-semibold text-ocean-950">{pendingDelete.name}</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" disabled={saving} onClick={() => void deletePackage(pendingDelete)}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                {saving ? 'Eliminando...' : 'Eliminar paquete'}
              </button>
              <button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={() => setPendingDelete(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
