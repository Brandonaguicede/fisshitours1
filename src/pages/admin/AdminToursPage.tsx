import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, Info, Loader2, Package, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminModuleSurface, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage, type StorageImage } from '../../services/imageService';
import type { Tables } from '../../types/supabase';

type TourRow = Tables<'tours'>;
type BoatRow = Pick<Tables<'boats'>, 'id' | 'name' | 'max_guests' | 'active' | 'sort_order'>;
type BoatTourRow = Tables<'boat_tours'>;
type PackageRow = Tables<'tour_packages'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;
type TourLocationRow = Tables<'tour_locations'>;
type PublicationStatus = 'draft' | 'published' | 'inactive';
type EditorStep = 'info' | 'gallery' | 'experience' | 'packages';

interface EditablePackage {
  id: string;
  boatTourId: string | null;
  boatId: string | null;
  name: string;
  packageType: string;
  durationHours: string;
  basePrice: string;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  description: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  sortOrder: number;
  active: boolean;
  customQuote: boolean;
  isNew: boolean;
  pendingDelete?: boolean;
}

interface EditableInclusion {
  id: string;
  label: string;
  packageId: string | null;
  sortOrder: number;
  active: boolean;
  isNew: boolean;
  pendingDelete?: boolean;
}

interface TourEditor {
  id: string;
  title: string;
  slug: string;
  locations: string[];
  description: string;
  longDescription: string;
  category: string;
  publicationStatus: PublicationStatus;
  featured: boolean;
  sortOrder: number;
  activities: string[];
  images: TourImageRow[];
  inclusions: EditableInclusion[];
  packages: EditablePackage[];
}

type FieldErrors = Partial<Record<string, string>>;

const steps: Array<{ id: EditorStep; label: string }> = [
  { id: 'info', label: 'Información' },
  { id: 'gallery', label: 'Galería' },
  { id: 'experience', label: 'Experiencia' },
  { id: 'packages', label: 'Paquetes' },
];

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `tour-${Date.now()}`;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function publicationStatus(tour: TourRow): PublicationStatus {
  return tour.publication_status === 'draft' || tour.publication_status === 'inactive' || tour.publication_status === 'published'
    ? tour.publication_status
    : tour.active ? 'published' : 'inactive';
}

function createEditor(tour: TourRow, packages: PackageRow[], relations: BoatTourRow[], images: TourImageRow[], inclusions: TourInclusionRow[], locations: TourLocationRow[]): TourEditor {
  const boatByBoatTour = new Map(relations.map((relation) => [relation.id, relation.boat_id]));
  return {
    id: tour.id, title: tour.title, slug: tour.slug,
    locations: locations.filter((item) => item.tour_id === tour.id).sort((a, b) => a.sort_order - b.sort_order).map((item) => item.location).concat(locations.some((item) => item.tour_id === tour.id) || !tour.location?.trim() ? [] : [tour.location.trim()]),
    description: tour.description ?? '',
    longDescription: tour.long_description ?? '', category: tour.category, publicationStatus: publicationStatus(tour), featured: tour.featured,
    sortOrder: tour.sort_order, activities: stringList(tour.highlights),
    images: [...images].sort((a, b) => a.sort_order - b.sort_order),
    packages: packages.map((item) => ({
      id: item.id, boatTourId: item.boat_tour_id, boatId: boatByBoatTour.get(item.boat_tour_id) ?? null, name: item.name, packageType: item.package_type,
      durationHours: item.duration_minutes == null ? '' : String(item.duration_minutes / 60), basePrice: String(item.base_price),
      includedGuests: item.included_guests, maxGuests: item.max_guests, extraGuestPrice: Number(item.extra_guest_price),
      description: item.description ?? '', imageUrl: item.image_url, imagePublicId: item.image_public_id,
      sortOrder: item.sort_order, active: item.active, customQuote: item.custom_quote, isNew: false,
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    inclusions: inclusions.map((item) => ({ id: item.id, label: item.label, packageId: item.tour_package_id, sortOrder: item.sort_order, active: item.active, isNew: false })).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export default function AdminToursPage() {
  const navigate = useNavigate();
  const [tours, setTours] = useState<TourRow[]>([]);
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [locationRows, setLocationRows] = useState<TourLocationRow[]>([]);
  const [relations, setRelations] = useState<BoatTourRow[]>([]);
  const [packageRows, setPackageRows] = useState<PackageRow[]>([]);
  const [imageRows, setImageRows] = useState<TourImageRow[]>([]);
  const [inclusionRows, setInclusionRows] = useState<TourInclusionRow[]>([]);
  const [editing, setEditing] = useState<TourEditor | null>(null);
  const [step, setStep] = useState<EditorStep>('info');
  const [gallerySlot, setGallerySlot] = useState<number | null>(null);
  const [deleteImage, setDeleteImage] = useState<TourImageRow | null>(null);
  const [pendingTourDelete, setPendingTourDelete] = useState<TourRow | null>(null);
  const [togglingTourId, setTogglingTourId] = useState<string | null>(null);
  const [deletingTour, setDeletingTour] = useState(false);
  const [activityInput, setActivityInput] = useState('');
  const [inclusionInput, setInclusionInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function loadTours() {
    setLoading(true);
    const [tourResult, boatResult, relationResult, packageResult, imageResult, inclusionResult, locationResult] = await Promise.all([
      supabase.from('tours').select('*').order('sort_order'),
      supabase.from('boats').select('id, name, max_guests, active, sort_order').order('sort_order'),
      supabase.from('boat_tours').select('*').order('sort_order'),
      supabase.from('tour_packages').select('*').order('sort_order'),
      supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
      supabase.from('tour_inclusions').select('*').order('sort_order'),
      supabase.from('tour_locations').select('*').order('sort_order'),
    ]);
    setLoading(false);
    const loadError = tourResult.error ?? boatResult.error ?? relationResult.error ?? packageResult.error ?? imageResult.error ?? inclusionResult.error ?? locationResult.error;
    if (loadError) { setError(loadError.message); return; }
    setTours(tourResult.data ?? []); setBoats(boatResult.data ?? []); setLocationRows(locationResult.data ?? []);
    setRelations(relationResult.data ?? []); setPackageRows(packageResult.data ?? []); setImageRows(imageResult.data ?? []); setInclusionRows(inclusionResult.data ?? []);
  }

  useEffect(() => { void loadTours(); }, []);

  function markEditing(next: TourEditor) { setEditing(next); setDirty(true); }

  function openEditor(tour: TourRow) {
    const tourRelations = relations.filter((item) => item.tour_id === tour.id);
    setEditing(createEditor(tour, packageRows.filter((item) => tourRelations.some((relation) => relation.id === item.boat_tour_id)), tourRelations, imageRows.filter((item) => item.tour_id === tour.id), inclusionRows.filter((item) => item.tour_id === tour.id), locationRows));
    setStep('info'); setFieldErrors({}); setGallerySlot(null); setLocationInput(''); setDirty(false); setError('');
  }

  async function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error: insertError } = await supabase.from('tours').insert({ id, title: 'Nuevo tour', slug: id, category: 'Snorkeling & Beach', publication_status: 'draft', active: false, featured: false, rating: 5, sort_order: tours.length + 1, description: '', long_description: '', highlights: [], included: [] }).select('*').single();
    if (insertError) { setError(insertError.message); return; }
    await loadTours(); setEditing(createEditor(data, [], [], [], [], [])); setStep('info'); setDirty(true);
  }

  async function toggleTourPublication(tour: TourRow) {
    setTogglingTourId(tour.id);
    setError(''); setNotice('');
    const nextStatus: PublicationStatus = publicationStatus(tour) === 'published' ? 'inactive' : 'published';
    const { error: updateError } = await supabase.from('tours').update({ publication_status: nextStatus, updated_at: new Date().toISOString() }).eq('id', tour.id);
    setTogglingTourId(null);
    if (updateError) { setError(updateError.message); return; }
    setNotice(nextStatus === 'published' ? 'Tour activado.' : 'Tour desactivado.');
    await loadTours();
  }

  async function deleteTour(tour: TourRow) {
    setDeletingTour(true);
    setError('');
    const { error: deleteError } = await supabase.from('tours').delete().eq('id', tour.id);
    setDeletingTour(false);
    if (deleteError) {
      setPendingTourDelete(null);
      setError(`${deleteError.message}. Si el tour tiene reservas o paquetes con historial, desactívalo en lugar de eliminarlo.`);
      return;
    }
    setPendingTourDelete(null);
    if (editing?.id === tour.id) setEditing(null);
    setNotice('Tour eliminado.');
    await loadTours();
  }

  function requestClose() {
    if (dirty && !window.confirm('Hay cambios sin guardar. Si cierras ahora, se perderán.')) return;
    setEditing(null); setFieldErrors({}); setDirty(false); setError('');
  }

  function validateFinal(editor: TourEditor) {
    const errors: FieldErrors = {};
    if (!editor.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
    if (![3, 6, 9].includes(editor.images.length)) errors.images = 'Para finalizar se requieren exactamente 3, 6 o 9 fotografías.';
    return errors;
  }

  async function persistInfo(editor: TourEditor) {
    const locations = editor.locations.map((item) => item.trim()).filter(Boolean);
    const { error: tourError } = await supabase.from('tours').update({ title: editor.title.trim(), slug: editor.slug, location: locations[0] ?? null, description: editor.description.trim(), long_description: editor.longDescription.trim() || null, category: editor.category, sort_order: editor.sortOrder, updated_at: new Date().toISOString() }).eq('id', editor.id);
    if (tourError) throw new Error(tourError.message);
    const { error: removeError } = await supabase.from('tour_locations').delete().eq('tour_id', editor.id);
    if (removeError) throw new Error(removeError.message);
    if (locations.length) {
      const { error: insertError } = await supabase.from('tour_locations').insert(locations.map((location, index) => ({ tour_id: editor.id, location, sort_order: index })));
      if (insertError) throw new Error(insertError.message);
    }
  }

  async function persistExperience(editor: TourEditor) {
    const included = editor.inclusions.filter((item) => !item.pendingDelete && item.active && item.packageId === null).map((item) => item.label.trim()).filter(Boolean);
    const { error: tourError } = await supabase.from('tours').update({ highlights: editor.activities.map((item) => item.trim()).filter(Boolean), included, updated_at: new Date().toISOString() }).eq('id', editor.id);
    if (tourError) throw new Error(tourError.message);
    for (const item of editor.inclusions) {
      if (item.pendingDelete) { if (!item.isNew) await supabase.from('tour_inclusions').delete().eq('id', item.id); continue; }
      if (!item.label.trim()) continue;
      const { error: inclusionError } = await supabase.from('tour_inclusions').upsert({ id: item.id, tour_id: editor.id, tour_package_id: item.packageId, label: item.label.trim(), sort_order: item.sortOrder, active: true, updated_at: new Date().toISOString() });
      if (inclusionError) throw new Error(inclusionError.message);
    }
  }

  async function persistStep() {
    if (!editing) return false;
    setSaving(true); setError('');
    try {
      if (step === 'info') await persistInfo(editing);
      if (step === 'experience') await persistExperience(editing);
      setSaving(false); setDirty(false); await loadTours(); return true;
    } catch (caught) { setSaving(false); setError(caught instanceof Error ? caught.message : 'No se pudo guardar este paso.'); return false; }
  }

  async function finishTour() {
    if (!editing || saving) return;
    const errors = validateFinal(editing); setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('El borrador se conserva. Completa los campos marcados antes de finalizar.'); setStep(errors.images ? 'gallery' : 'info'); return; }
    setSaving(true); setError('');
    try {
      await persistInfo(editing); await persistExperience(editing);
      const firstImage = editing.images[0];
      const { error: tourError } = await supabase.from('tours').update({ publication_status: 'published', active: true, featured: editing.featured, image_url: firstImage?.image_url ?? null, image_public_id: firstImage?.storage_path ?? null, image_alt: firstImage?.alt_text || editing.title, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (tourError) throw new Error(tourError.message);
      setSaving(false); setDirty(false); setEditing(null); setNotice('Tour guardado y activado.'); await loadTours();
    } catch (caught) { setSaving(false); setError(caught instanceof Error ? caught.message : 'No se pudo finalizar el tour.'); }
  }

  async function saveGalleryImage(image: StorageImage, slot: number) {
    if (!editing) return;
    const current = editing.images[slot];
    const payload = { tour_id: editing.id, image_url: image.public_url, storage_path: image.storage_path, alt_text: `${editing.title} foto ${slot + 1}`, is_primary: slot === 0, sort_order: slot + 1, active: true };
    const result = current
      ? await supabase.from('tour_images').update(payload).eq('id', current.id).select('*').single()
      : await supabase.from('tour_images').insert(payload).select('*').single();
    if (result.error) throw new Error(result.error.message);
    if (slot === 0) { await supabase.from('tour_images').update({ is_primary: false }).eq('tour_id', editing.id).neq('id', result.data.id); }
    const images = [...editing.images]; images[slot] = result.data;
    markEditing({ ...editing, images: images.filter(Boolean).map((item, index) => ({ ...item, sort_order: index + 1, is_primary: index === 0 })) });
    setGallerySlot(null); await loadTours();
  }

  async function removeGalleryImage(image: TourImageRow) {
    if (!editing) return;
    const { error: updateError } = await supabase.from('tour_images').update({ active: false, pending_deletion: Boolean(image.storage_path) }).eq('id', image.id);
    if (updateError) { setError(updateError.message); return; }
    if (image.storage_path) { try { await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'tour_images', resourceId: image.id }); } catch { /* cleanup remains pending */ } }
    const images = editing.images.filter((item) => item.id !== image.id).map((item, index) => ({ ...item, sort_order: index + 1, is_primary: index === 0 }));
    await Promise.all(images.map((item) => supabase.from('tour_images').update({ sort_order: item.sort_order, is_primary: item.is_primary }).eq('id', item.id)));
    markEditing({ ...editing, images }); setDeleteImage(null); await loadTours();
  }

  function addActivity() { if (!editing || !activityInput.trim()) return; markEditing({ ...editing, activities: [...editing.activities, activityInput.trim()] }); setActivityInput(''); }
  function addInclusion() { if (!editing || !inclusionInput.trim()) return; markEditing({ ...editing, inclusions: [...editing.inclusions, { id: crypto.randomUUID(), label: inclusionInput.trim(), packageId: null, sortOrder: editing.inclusions.length + 1, active: true, isNew: true }] }); setInclusionInput(''); }
  async function navigateStep(direction: -1 | 1) {
    if (!editing || saving) return;
    if (direction === 1) {
      const errors: FieldErrors = {};
      if (step === 'info' && !editing.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
      if (step === 'gallery' && editing.images.length < 3) errors.images = 'Agrega al menos 3 fotografías para continuar.';
      setFieldErrors(errors); if (Object.keys(errors).length) return;
      if (!(await persistStep())) return;
    }
    const index = steps.findIndex((item) => item.id === step);
    setStep(steps[Math.max(0, Math.min(3, index + direction))].id);
  }

  const locationsByTour = useMemo(() => new Map(tours.map((tour) => [tour.id, locationRows.filter((item) => item.tour_id === tour.id).sort((a, b) => a.sort_order - b.sort_order).map((item) => item.location)])), [tours, locationRows]);
  const visibleTours = tours.filter((tour) => `${tour.title} ${(locationsByTour.get(tour.id) ?? [tour.location ?? '']).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const visiblePackages = useMemo(() => editing?.packages.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [editing]);

  return (
    <div className="admin-page">
      <AdminModuleSurface className="admin-tours-surface">
        <AdminToolbar embedded><div className="admin-search-field"><Search aria-hidden="true" size={16} /><input className="admin-input" aria-label="Buscar tours" placeholder="Buscar tour por nombre o ubicación" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="admin-toolbar__actions"><button className="admin-btn" type="button" onClick={() => void createTour()}><Plus size={16} /> Crear tour</button></div></AdminToolbar>
        {error && !editing ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice && !editing ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
        {loading ? <p className="admin-muted">Cargando tours...</p> : <AdminTable embedded headers={['Tour', 'Ubicaciones', 'Publicación', 'Orden', 'Acciones']}>{visibleTours.map((tour) => <tr key={tour.id}><td>{tour.title}<div className="admin-muted">{tour.description || tour.slug}</div></td><td>{(locationsByTour.get(tour.id) ?? [tour.location ?? '']).filter(Boolean).join(', ') || '-'}</td><td><AdminBadge value={publicationStatus(tour) === 'draft' ? 'Borrador' : publicationStatus(tour) === 'published' ? 'Activo' : 'Inactivo'} /></td><td>{tour.sort_order}</td><td><div className="admin-row-actions">
          <button className="admin-icon-action" type="button" title="Editar tour" aria-label={`Editar tour ${tour.title}`} onClick={() => openEditor(tour)}><Pencil size={17} /></button>
          <button
            className={`admin-icon-action ${publicationStatus(tour) === 'published' ? 'admin-icon-action--success' : 'admin-icon-action--warning'}`}
            type="button"
            title={publicationStatus(tour) === 'published' ? 'Desactivar tour' : 'Activar tour'}
            aria-label={publicationStatus(tour) === 'published' ? `Desactivar tour ${tour.title}` : `Activar tour ${tour.title}`}
            disabled={togglingTourId === tour.id}
            onClick={() => void toggleTourPublication(tour)}
          >
            {togglingTourId === tour.id ? <Loader2 className="animate-spin" size={17} /> : publicationStatus(tour) === 'published' ? <Eye size={17} /> : <EyeOff size={17} />}
          </button>
          <button className="admin-icon-action admin-icon-action--danger" type="button" title="Eliminar tour" aria-label={`Eliminar tour ${tour.title}`} onClick={() => setPendingTourDelete(tour)}><Trash2 size={17} /></button>
        </div></td></tr>)}{visibleTours.length === 0 ? <tr><td colSpan={5} className="admin-muted">No hay tours para esta búsqueda.</td></tr> : null}</AdminTable>}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={requestClose} titleId="tour-edit-title" className="admin-tour-modal">
        {editing ? <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void finishTour(); }}>
          <header className="admin-modal-header"><div><h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> {editing.title}</h2><p className="admin-muted">{steps.findIndex((item) => item.id === step) + 1} de 4 · {steps.find((item) => item.id === step)?.label}</p></div><button className="admin-icon-btn" type="button" aria-label="Cerrar editor" onClick={requestClose}><X size={18} /></button></header>
          <ol className="admin-stepper" aria-label="Progreso del Tour">{steps.map((item, index) => <li key={item.id} aria-current={step === item.id ? 'step' : undefined} className={step === item.id ? 'admin-stepper__item admin-stepper__item--active' : 'admin-stepper__item'}><button type="button" onClick={() => setStep(item.id)}><span>{index + 1}</span><strong>{item.label}</strong></button></li>)}</ol>
          <div className="admin-modal-body admin-tour-step-body">{error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
            {step === 'info' ? <InfoStep editing={editing} locationInput={locationInput} setLocationInput={setLocationInput} errors={fieldErrors} onChange={markEditing} /> : null}
            {step === 'gallery' ? <GalleryStep editing={editing} errors={fieldErrors} selectedSlot={gallerySlot} setSelectedSlot={setGallerySlot} setDeleteImage={setDeleteImage} saveImage={saveGalleryImage} /> : null}
            {step === 'experience' ? <ExperienceStep editing={editing} activityInput={activityInput} inclusionInput={inclusionInput} setActivityInput={setActivityInput} setInclusionInput={setInclusionInput} addActivity={addActivity} addInclusion={addInclusion} onChange={markEditing} /> : null}
            {step === 'packages' ? <PackagesStep boats={boats} packages={visiblePackages} onManageBoat={(boatId) => navigate(boatId ? `/admin/boats?boatId=${boatId}` : '/admin/boats')} /> : null}
          </div>
          <ModalFooter><button className="admin-btn admin-btn--secondary" type="button" onClick={requestClose}>Cancelar</button>{step !== 'info' ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void navigateStep(-1)}><ChevronLeft size={15} /> Anterior</button> : null}{step !== 'packages' ? <button className="admin-btn" type="button" disabled={saving} onClick={() => void navigateStep(1)}>{saving ? <Loader2 className="animate-spin" size={15} /> : null} Siguiente <ChevronRight size={15} /></button> : <button className="admin-btn" type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Finalizar</button>}</ModalFooter>
        </form> : null}
      </Modal>

      <Modal open={Boolean(deleteImage)} onClose={() => setDeleteImage(null)} titleId="image-delete-title" className="max-w-md">{deleteImage ? <div className="admin-modal-card"><h2 id="image-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar fotografía</h2><p className="admin-muted mt-2">Las siguientes fotografías se reordenarán automáticamente.</p><div className="admin-actions mt-5"><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setDeleteImage(null)}>Cancelar</button><button className="admin-btn admin-btn--danger" type="button" onClick={() => void removeGalleryImage(deleteImage)}>Eliminar</button></div></div> : null}</Modal>

      <Modal open={Boolean(pendingTourDelete)} onClose={() => setPendingTourDelete(null)} titleId="tour-delete-title" className="max-w-md">
        {pendingTourDelete ? <div className="admin-modal-card">
          <h2 id="tour-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar tour</h2>
          <p className="admin-muted mt-2">Esta acción elimina "{pendingTourDelete.title}" y sus paquetes asociados. Si tiene reservas históricas, la base de datos bloqueará la eliminación.</p>
          <div className="admin-actions mt-5">
            <button className="admin-btn admin-btn--secondary" type="button" disabled={deletingTour} onClick={() => setPendingTourDelete(null)}>Cancelar</button>
            <button className="admin-btn admin-btn--danger" type="button" disabled={deletingTour} onClick={() => void deleteTour(pendingTourDelete)}>{deletingTour ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} Eliminar</button>
          </div>
        </div> : null}
      </Modal>
    </div>
  );
}

function InfoStep({ editing, locationInput, setLocationInput, errors, onChange }: { editing: TourEditor; locationInput: string; setLocationInput: (value: string) => void; errors: FieldErrors; onChange: (value: TourEditor) => void }) {
  const addLocation = () => {
    const value = locationInput.trim();
    if (!value || editing.locations.some((item) => item.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0)) return;
    onChange({ ...editing, locations: [...editing.locations, value] }); setLocationInput('');
  };
  return <FormSection title="Información general" description="Los datos esenciales que describen el Tour." icon={<Info size={16} />}><div className="admin-form-columns"><label className="admin-field"><span className="admin-field__label">Nombre del tour</span><input className="admin-input" aria-invalid={Boolean(errors.title) || undefined} value={editing.title} onChange={(event) => onChange({ ...editing, title: event.target.value, slug: slugify(event.target.value) })} />{errors.title ? <span className="admin-field-error">{errors.title}</span> : null}</label><div className="admin-field"><span className="admin-field__label">Ubicaciones</span><div className="admin-list-editor__add"><input className="admin-input" value={locationInput} placeholder="Ej. Papagayo" onChange={(event) => setLocationInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLocation(); } }} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addLocation}><Plus size={14} /> Agregar</button></div><div className="admin-location-chips">{editing.locations.map((location) => <span className="admin-location-chip" key={location.toLocaleLowerCase()}>{location}<button type="button" aria-label={`Eliminar ubicación ${location}`} onClick={() => onChange({ ...editing, locations: editing.locations.filter((item) => item !== location) })}><X size={13} /></button></span>)}</div></div></div><label className="admin-field"><span className="admin-field__label">Frase</span><textarea className="admin-input" rows={3} value={editing.description} onChange={(event) => onChange({ ...editing, description: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Descripción</span><textarea className="admin-input admin-textarea-list" value={editing.longDescription} onChange={(event) => onChange({ ...editing, longDescription: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Orden de aparición</span><input className="admin-input" type="number" value={editing.sortOrder} onChange={(event) => onChange({ ...editing, sortOrder: Number(event.target.value) })} /></label></FormSection>;
}

function GalleryStep({ editing, errors, selectedSlot, setSelectedSlot, setDeleteImage, saveImage }: { editing: TourEditor; errors: FieldErrors; selectedSlot: number | null; setSelectedSlot: (value: number | null) => void; setDeleteImage: (value: TourImageRow | null) => void; saveImage: (image: StorageImage, slot: number) => Promise<void> }) {
  return <FormSection title="Galería" description="Mínimo 3 imágenes para continuar. Para finalizar: 3, 6 o 9. Máximo 9." icon={<ImageIcon size={16} />}>{errors.images ? <div className="admin-alert admin-alert--danger">{errors.images}</div> : null}<div className="admin-tour-image-slots">{Array.from({ length: 9 }, (_, index) => { const image = editing.images[index]; const selected = selectedSlot === index; return <article className={`admin-tour-image-slot${selected ? ' admin-tour-image-slot--editing' : ''}`} key={image?.id ?? index}><header><strong>Foto {index + 1}</strong>{index === 0 ? <AdminBadge value="Portada" /> : null}</header>{selected ? <AdminImageManager resourceTable="tours" resourceId={editing.id} folder="tours" currentImageUrl={image?.image_url} currentStoragePath={image?.storage_path} label={`${editing.title} foto ${index + 1}`} aspect={3 / 2} maxWidth={1200} maxHeight={800} maxSizeMB={0.35} retainPreviousOnUpload requireReplacementToDelete onImageSaved={(saved) => saveImage(saved, index)} /> : image ? <button className="admin-tour-image-slot__media" type="button" aria-label={`Cambiar foto ${index + 1}`} onClick={() => setSelectedSlot(index)}><img src={image.image_url} alt={image.alt_text || `${editing.title} foto ${index + 1}`} /></button> : <button className="admin-tour-image-slot__empty" type="button" onClick={() => setSelectedSlot(index)}><Plus size={18} /> Seleccionar</button>}<footer>{selected ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setSelectedSlot(null)}>Cerrar</button> : <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setSelectedSlot(index)}>{image ? 'Cambiar' : 'Seleccionar'}</button>}{image && !selected ? <button className="admin-icon-btn" type="button" aria-label={`Eliminar foto ${index + 1}`} onClick={() => setDeleteImage(image)}><Trash2 size={15} /></button> : null}</footer></article>; })}</div></FormSection>;
}

function ExperienceStep({ editing, activityInput, inclusionInput, setActivityInput, setInclusionInput, addActivity, addInclusion, onChange }: { editing: TourEditor; activityInput: string; inclusionInput: string; setActivityInput: (value: string) => void; setInclusionInput: (value: string) => void; addActivity: () => void; addInclusion: () => void; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Actividades e incluye" description="Listas editables sin un máximo artificial." icon={<Check size={16} />}><div className="admin-dynamic-list"><h3>Actividades del Tour</h3>{editing.activities.map((item, index) => <div className="admin-dynamic-list__row" key={index}><input className="admin-input" value={item} onChange={(event) => onChange({ ...editing, activities: editing.activities.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar actividad ${index + 1}`} onClick={() => onChange({ ...editing, activities: editing.activities.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={activityInput} onChange={(event) => setActivityInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addActivity}><Plus size={14} /> Agregar actividad</button></div></div><div className="admin-dynamic-list"><h3>Incluye</h3>{editing.inclusions.filter((item) => !item.pendingDelete).map((item) => <div className="admin-dynamic-list__row" key={item.id}><input className="admin-input" value={item.label} onChange={(event) => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar ${item.label}`} onClick={() => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, pendingDelete: true } : current) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={inclusionInput} onChange={(event) => setInclusionInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addInclusion}><Plus size={14} /> Agregar</button></div></div></FormSection>;
}

function PackagesStep({ boats, packages, onManageBoat }: { boats: BoatRow[]; packages: EditablePackage[]; onManageBoat: (boatId: string | null) => void }) {
  const boatName = (boatId: string | null) => boats.find((item) => item.id === boatId)?.name ?? boatId ?? 'Sin bote asignado';
  const groups = new Map<string | null, EditablePackage[]>();
  for (const item of packages) {
    const list = groups.get(item.boatId) ?? [];
    list.push(item);
    groups.set(item.boatId, list);
  }
  return (
    <FormSection
      title="Paquetes (solo lectura)"
      description="Los precios y paquetes se administran por bote. Abre Botes › Tours y paquetes para editarlos."
      icon={<Package size={16} />}
    >
      {packages.length === 0 ? (
        <p className="admin-muted">Este tour todavía no tiene paquetes en ningún bote.</p>
      ) : null}
      {[...groups.entries()].map(([boatId, list]) => (
        <div className="admin-dynamic-list" key={boatId ?? 'none'}>
          <h3>{boatName(boatId)}</h3>
          <div className="admin-package-previews">
            {list.map((item) => (
              <article className="admin-package-preview" key={item.id}>
                <strong>
                  {item.name || 'Paquete sin nombre'}
                  {!item.active ? <span className="admin-muted"> · inactivo</span> : null}
                </strong>
                <span className="admin-muted">
                  {item.customQuote ? 'Cotizar' : `$${item.basePrice}`} · {item.includedGuests} incl. / {item.maxGuests} máx.
                </span>
              </article>
            ))}
          </div>
          <button className="admin-btn admin-btn--secondary" type="button" onClick={() => onManageBoat(boatId)}>
            <Pencil size={15} /> Editar paquetes en {boatName(boatId)}
          </button>
        </div>
      ))}
      {boats.length === 0 ? null : (
        <button className="admin-btn admin-btn--ghost" type="button" onClick={() => onManageBoat(null)}>
          <Plus size={15} /> Añadir este tour a otro bote
        </button>
      )}
    </FormSection>
  );
}
