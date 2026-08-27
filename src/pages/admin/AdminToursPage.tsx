import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, Info, Loader2, Package, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
type DestinationRow = Pick<Tables<'destinations'>, 'id' | 'name' | 'active' | 'sort_order'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;
type PublicationStatus = 'draft' | 'published' | 'inactive';
type EditorStep = 'info' | 'gallery' | 'experience' | 'packages';

interface EditablePackage {
  id: string;
  boatTourId: string | null;
  name: string;
  packageType: string;
  durationHours: number;
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
  location: string;
  description: string;
  longDescription: string;
  category: string;
  publicationStatus: PublicationStatus;
  featured: boolean;
  sortOrder: number;
  boatId: string;
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

function packageDraft(boat: BoatRow | undefined, sortOrder: number): EditablePackage {
  return {
    id: `package-${crypto.randomUUID().slice(0, 8)}`, boatTourId: null, name: '', packageType: '', durationHours: 4,
    basePrice: '', includedGuests: 1, maxGuests: boat?.max_guests ?? 1, extraGuestPrice: 0, description: '', imageUrl: null,
    imagePublicId: null, sortOrder, active: true, customQuote: false, isNew: true,
  };
}

function createEditor(tour: TourRow, packages: PackageRow[], relations: BoatTourRow[], images: TourImageRow[], inclusions: TourInclusionRow[]): TourEditor {
  const firstRelation = relations.find((relation) => relation.tour_id === tour.id && packages.some((item) => item.boat_tour_id === relation.id))
    ?? relations.find((relation) => relation.tour_id === tour.id);
  return {
    id: tour.id, title: tour.title, slug: tour.slug, location: tour.location ?? '', description: tour.description ?? '',
    longDescription: tour.long_description ?? '', category: tour.category, publicationStatus: publicationStatus(tour), featured: tour.featured,
    sortOrder: tour.sort_order, boatId: firstRelation?.boat_id ?? '', activities: stringList(tour.highlights),
    images: [...images].sort((a, b) => a.sort_order - b.sort_order),
    packages: packages.map((item) => ({
      id: item.id, boatTourId: item.boat_tour_id, name: item.name, packageType: item.package_type,
      durationHours: Math.max(0.5, (item.duration_minutes ?? 240) / 60), basePrice: String(item.base_price),
      includedGuests: item.included_guests, maxGuests: item.max_guests, extraGuestPrice: Number(item.extra_guest_price),
      description: item.description ?? '', imageUrl: item.image_url, imagePublicId: item.image_public_id,
      sortOrder: item.sort_order, active: item.active, customQuote: item.custom_quote, isNew: false,
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    inclusions: inclusions.map((item) => ({ id: item.id, label: item.label, packageId: item.tour_package_id, sortOrder: item.sort_order, active: item.active, isNew: false })).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export default function AdminToursPage() {
  const [tours, setTours] = useState<TourRow[]>([]);
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [relations, setRelations] = useState<BoatTourRow[]>([]);
  const [packageRows, setPackageRows] = useState<PackageRow[]>([]);
  const [imageRows, setImageRows] = useState<TourImageRow[]>([]);
  const [inclusionRows, setInclusionRows] = useState<TourInclusionRow[]>([]);
  const [editing, setEditing] = useState<TourEditor | null>(null);
  const [step, setStep] = useState<EditorStep>('info');
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [gallerySlot, setGallerySlot] = useState<number | null>(null);
  const [deletePackage, setDeletePackage] = useState<EditablePackage | null>(null);
  const [deleteImage, setDeleteImage] = useState<TourImageRow | null>(null);
  const [activityInput, setActivityInput] = useState('');
  const [inclusionInput, setInclusionInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function loadTours() {
    setLoading(true);
    const [tourResult, boatResult, destinationResult, relationResult, packageResult, imageResult, inclusionResult] = await Promise.all([
      supabase.from('tours').select('*').order('sort_order'),
      supabase.from('boats').select('id, name, max_guests, active, sort_order').order('sort_order'),
      supabase.from('destinations').select('id, name, active, sort_order').eq('active', true).order('sort_order'),
      supabase.from('boat_tours').select('*').order('sort_order'),
      supabase.from('tour_packages').select('*').order('sort_order'),
      supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
      supabase.from('tour_inclusions').select('*').order('sort_order'),
    ]);
    setLoading(false);
    const loadError = tourResult.error ?? boatResult.error ?? destinationResult.error ?? relationResult.error ?? packageResult.error ?? imageResult.error ?? inclusionResult.error;
    if (loadError) { setError(loadError.message); return; }
    setTours(tourResult.data ?? []); setBoats(boatResult.data ?? []); setDestinations(destinationResult.data ?? []);
    setRelations(relationResult.data ?? []); setPackageRows(packageResult.data ?? []); setImageRows(imageResult.data ?? []); setInclusionRows(inclusionResult.data ?? []);
  }

  useEffect(() => { void loadTours(); }, []);

  function markEditing(next: TourEditor) { setEditing(next); setDirty(true); }

  function openEditor(tour: TourRow) {
    const tourRelations = relations.filter((item) => item.tour_id === tour.id);
    setEditing(createEditor(tour, packageRows.filter((item) => tourRelations.some((relation) => relation.id === item.boat_tour_id)), tourRelations, imageRows.filter((item) => item.tour_id === tour.id), inclusionRows.filter((item) => item.tour_id === tour.id)));
    setStep('info'); setFieldErrors({}); setEditingPackageId(null); setGallerySlot(null); setDirty(false); setError('');
  }

  async function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error: insertError } = await supabase.from('tours').insert({ id, title: 'Nuevo tour', slug: id, category: 'Snorkeling & Beach', publication_status: 'draft', active: false, featured: false, rating: 5, sort_order: tours.length + 1, description: '', long_description: '', highlights: [], included: [] }).select('*').single();
    if (insertError) { setError(insertError.message); return; }
    await loadTours(); setEditing(createEditor(data, [], [], [], [])); setStep('info'); setDirty(true);
  }

  function requestClose() {
    if (dirty && !window.confirm('Hay cambios sin guardar. Si cierras ahora, se perderán.')) return;
    setEditing(null); setFieldErrors({}); setDirty(false); setError('');
  }

  function validate(editor: TourEditor, publishing = editor.publicationStatus === 'published') {
    const errors: FieldErrors = {};
    if (!editor.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
    if (!editor.location.trim()) errors.location = 'La ubicación es obligatoria.';
    if (!editor.description.trim()) errors.description = 'La frase es obligatoria.';
    if (!editor.slug.trim()) errors.slug = 'El identificador interno es obligatorio.';
    const packages = editor.packages.filter((item) => !item.pendingDelete);
    if (packages.length && !editor.boatId) errors.boat = 'Selecciona el bote asociado al Tour.';
    if (publishing && ![3, 6, 9].includes(editor.images.length)) errors.images = 'Para publicar se requieren exactamente 3, 6 o 9 fotografías.';
    if (publishing && !packages.some((item) => item.active)) errors.packages = 'Para publicar se requiere al menos un paquete activo.';
    packages.forEach((item) => {
      if (!item.name.trim()) errors[`package-${item.id}-name`] = 'El nombre es obligatorio.';
      if (!Number.isFinite(item.durationHours) || item.durationHours <= 0) errors[`package-${item.id}-duration`] = 'La duración debe ser mayor que cero.';
      if (!item.basePrice.trim() || !Number.isFinite(Number(item.basePrice)) || Number(item.basePrice) < 0) errors[`package-${item.id}-price`] = 'Ingresa un precio válido.';
      if (!Number.isFinite(item.includedGuests) || item.includedGuests < 1) errors[`package-${item.id}-included`] = 'Debe incluir al menos una persona.';
      if (!Number.isFinite(item.extraGuestPrice) || item.extraGuestPrice < 0) errors[`package-${item.id}-extra`] = 'El extra no puede ser negativo.';
      const boat = boats.find((candidate) => candidate.id === editor.boatId);
      if (boat && item.includedGuests > boat.max_guests) errors[`package-${item.id}-included`] = `El bote admite máximo ${boat.max_guests} personas.`;
    });
    return errors;
  }

  async function ensureBoatTour(tourId: string, boatId: string) {
    const known = relations.find((item) => item.tour_id === tourId && item.boat_id === boatId);
    if (known) return known.id;
    const { data: existing, error: selectError } = await supabase.from('boat_tours').select('id').eq('tour_id', tourId).eq('boat_id', boatId).maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (existing) return existing.id;
    const { data, error: insertError } = await supabase.from('boat_tours').insert({ tour_id: tourId, boat_id: boatId, active: false, sort_order: relations.length + 1 }).select('id').single();
    if (insertError) throw new Error(insertError.message);
    return data.id;
  }

  async function save(status: PublicationStatus) {
    if (!editing || saving) return;
    const next = { ...editing, publicationStatus: status };
    const errors = validate(next, status === 'published'); setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('Revisa los campos marcados antes de guardar.'); setStep(errors.images ? 'gallery' : errors.packages || errors.boat || Object.keys(errors).some((key) => key.startsWith('package-')) ? 'packages' : 'info'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const firstImage = next.images[0];
      const { error: tourError } = await supabase.from('tours').update({ title: next.title.trim(), slug: next.slug, location: next.location.trim(), description: next.description.trim(), long_description: next.longDescription.trim() || null, category: next.category, publication_status: status, active: status === 'published', featured: next.featured, sort_order: next.sortOrder, highlights: next.activities.map((item) => item.trim()).filter(Boolean), included: next.inclusions.filter((item) => !item.pendingDelete && item.active && item.packageId === null).map((item) => item.label.trim()).filter(Boolean), image_url: firstImage?.image_url ?? null, image_public_id: firstImage?.storage_path ?? null, image_alt: firstImage?.alt_text || next.title, updated_at: new Date().toISOString() }).eq('id', next.id);
      if (tourError) throw new Error(tourError.message);
      for (const item of next.packages) {
        if (item.pendingDelete) { if (!item.isNew) { const { error: removeError } = await supabase.from('tour_packages').delete().eq('id', item.id); if (removeError) throw new Error(removeError.message); } continue; }
        const boatTourId = await ensureBoatTour(next.id, next.boatId);
        const boat = boats.find((candidate) => candidate.id === next.boatId);
        const { error: packageError } = await supabase.from('tour_packages').upsert({ id: item.id, boat_tour_id: boatTourId, name: item.name.trim(), package_type: item.packageType || slugify(item.name), description: item.description || null, duration_minutes: Math.round(item.durationHours * 60), base_price: Number(item.basePrice), included_guests: item.includedGuests, max_guests: Math.max(item.includedGuests, Math.min(item.maxGuests, boat?.max_guests ?? item.maxGuests)), extra_guest_price: item.extraGuestPrice, custom_quote: item.customQuote, image_url: item.imageUrl, image_public_id: item.imagePublicId, active: item.active, sort_order: item.sortOrder, updated_at: new Date().toISOString() });
        if (packageError) throw new Error(packageError.message);
      }
      for (const item of next.inclusions) {
        if (item.pendingDelete) { if (!item.isNew) await supabase.from('tour_inclusions').delete().eq('id', item.id); continue; }
        if (!item.label.trim()) continue;
        const { error: inclusionError } = await supabase.from('tour_inclusions').upsert({ id: item.id, tour_id: next.id, tour_package_id: item.packageId, label: item.label.trim(), sort_order: item.sortOrder, active: true, updated_at: new Date().toISOString() });
        if (inclusionError) throw new Error(inclusionError.message);
      }
      await loadTours(); setSaving(false); setDirty(false); setNotice(status === 'published' ? 'Tour publicado.' : 'Borrador guardado.');
    } catch (caught) { setSaving(false); setError(caught instanceof Error ? caught.message : 'No se pudo guardar el tour.'); }
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
  function addPackage() { if (!editing) return; const boat = boats.find((item) => item.id === editing.boatId) ?? boats[0]; const item = packageDraft(boat, editing.packages.length + 1); markEditing({ ...editing, boatId: editing.boatId || boat?.id || '', packages: [...editing.packages, item] }); setEditingPackageId(item.id); }
  function navigateStep(direction: -1 | 1) { if (!editing) return; if (direction === 1 && step === 'info') { const errors = validate(editing, false); const info = Object.fromEntries(Object.entries(errors).filter(([key]) => ['title', 'location', 'description', 'slug'].includes(key))); setFieldErrors(info); if (Object.keys(info).length) return; } const index = steps.findIndex((item) => item.id === step); setStep(steps[Math.max(0, Math.min(3, index + direction))].id); }

  async function toggleTour(tour: TourRow) {
    if (!tour.active) {
      const tourRelations = relations.filter((item) => item.tour_id === tour.id);
      const editor = createEditor(tour, packageRows.filter((item) => tourRelations.some((relation) => relation.id === item.boat_tour_id)), tourRelations, imageRows.filter((item) => item.tour_id === tour.id), inclusionRows.filter((item) => item.tour_id === tour.id));
      const errors = validate(editor, true);
      if (Object.keys(errors).length) {
        setEditing(editor); setFieldErrors(errors); setStep(errors.images ? 'gallery' : errors.packages || errors.boat ? 'packages' : 'info');
        setError('Completa los requisitos de publicación antes de activar el Tour.');
        return;
      }
    }
    const nextStatus: PublicationStatus = tour.active ? 'inactive' : 'published';
    const { error: updateError } = await supabase.from('tours').update({ publication_status: nextStatus, active: nextStatus === 'published', updated_at: new Date().toISOString() }).eq('id', tour.id);
    if (updateError) setError(updateError.message); else await loadTours();
  }

  const visibleTours = tours.filter((tour) => `${tour.title} ${tour.location ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const visiblePackages = useMemo(() => editing?.packages.filter((item) => !item.pendingDelete).sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [editing]);

  return (
    <div className="admin-page">
      <AdminModuleSurface className="admin-tours-surface">
        <AdminToolbar embedded><div className="admin-search-field"><Search aria-hidden="true" size={16} /><input className="admin-input" aria-label="Buscar tours" placeholder="Buscar tour por nombre o ubicación" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="admin-toolbar__actions"><button className="admin-btn" type="button" onClick={() => void createTour()}><Plus size={16} /> Crear tour</button></div></AdminToolbar>
        {error && !editing ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice && !editing ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
        {loading ? <p className="admin-muted">Cargando tours...</p> : <AdminTable embedded headers={['Tour', 'Ubicación', 'Publicación', 'Orden', 'Acciones']}>{visibleTours.map((tour) => <tr key={tour.id}><td>{tour.title}<div className="admin-muted">{tour.description || tour.slug}</div></td><td>{tour.location ?? '-'}</td><td><AdminBadge value={publicationStatus(tour)} /></td><td>{tour.sort_order}</td><td><div className="admin-actions"><button className="admin-btn admin-btn--ghost" type="button" onClick={() => openEditor(tour)}><Pencil size={14} /> Editar</button><button className="admin-icon-btn" type="button" title={tour.active ? 'Desactivar' : 'Activar'} aria-label={tour.active ? `Desactivar ${tour.title}` : `Activar ${tour.title}`} onClick={() => void toggleTour(tour)}>{tour.active ? <Eye size={16} /> : <EyeOff size={16} />}</button></div></td></tr>)}{visibleTours.length === 0 ? <tr><td colSpan={5} className="admin-muted">No hay tours para esta búsqueda.</td></tr> : null}</AdminTable>}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={requestClose} titleId="tour-edit-title" className="admin-tour-modal">
        {editing ? <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void save('published'); }}>
          <header className="admin-modal-header"><div><h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> {editing.title}</h2><p className="admin-muted">{steps.findIndex((item) => item.id === step) + 1} de 4 · {steps.find((item) => item.id === step)?.label}</p></div><button className="admin-icon-btn" type="button" aria-label="Cerrar editor" onClick={requestClose}><X size={18} /></button></header>
          <ol className="admin-stepper" aria-label="Progreso del Tour">{steps.map((item, index) => <li key={item.id} aria-current={step === item.id ? 'step' : undefined} className={step === item.id ? 'admin-stepper__item admin-stepper__item--active' : 'admin-stepper__item'}><button type="button" onClick={() => setStep(item.id)}><span>{index + 1}</span><strong>{item.label}</strong></button></li>)}</ol>
          <div className="admin-modal-body admin-tour-step-body">{error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
            {step === 'info' ? <InfoStep editing={editing} destinations={destinations} errors={fieldErrors} onChange={markEditing} /> : null}
            {step === 'gallery' ? <GalleryStep editing={editing} errors={fieldErrors} selectedSlot={gallerySlot} setSelectedSlot={setGallerySlot} setDeleteImage={setDeleteImage} saveImage={saveGalleryImage} /> : null}
            {step === 'experience' ? <ExperienceStep editing={editing} activityInput={activityInput} inclusionInput={inclusionInput} setActivityInput={setActivityInput} setInclusionInput={setInclusionInput} addActivity={addActivity} addInclusion={addInclusion} onChange={markEditing} /> : null}
            {step === 'packages' ? <PackagesStep editing={editing} boats={boats} packages={visiblePackages} errors={fieldErrors} editingPackageId={editingPackageId} setEditingPackageId={setEditingPackageId} onChange={markEditing} addPackage={addPackage} setDeletePackage={setDeletePackage} validate={validate} setErrors={setFieldErrors} /> : null}
          </div>
          <ModalFooter><button className="admin-btn admin-btn--secondary" type="button" onClick={requestClose}>Cancelar</button>{step !== 'info' ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => navigateStep(-1)}><ChevronLeft size={15} /> Anterior</button> : null}{step !== 'packages' ? <button className="admin-btn" type="button" onClick={() => navigateStep(1)}>Siguiente <ChevronRight size={15} /></button> : <><button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={() => void save('draft')}>Guardar borrador</button><button className="admin-btn" type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Publicar tour</button></>}</ModalFooter>
        </form> : null}
      </Modal>

      <Modal open={Boolean(deletePackage)} onClose={() => setDeletePackage(null)} titleId="package-delete-title" className="max-w-md">{deletePackage && editing ? <div className="admin-modal-card"><h2 id="package-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar paquete</h2><p className="admin-muted mt-2">Se eliminará “{deletePackage.name}”. Esta acción se aplicará al guardar el Tour.</p><div className="admin-actions mt-5"><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setDeletePackage(null)}>Cancelar</button><button className="admin-btn admin-btn--danger" type="button" onClick={() => { markEditing({ ...editing, packages: editing.packages.map((item) => item.id === deletePackage.id ? { ...item, pendingDelete: true } : item) }); setDeletePackage(null); }}><Trash2 size={15} /> Eliminar</button></div></div> : null}</Modal>
      <Modal open={Boolean(deleteImage)} onClose={() => setDeleteImage(null)} titleId="image-delete-title" className="max-w-md">{deleteImage ? <div className="admin-modal-card"><h2 id="image-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar fotografía</h2><p className="admin-muted mt-2">Las siguientes fotografías se reordenarán automáticamente.</p><div className="admin-actions mt-5"><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setDeleteImage(null)}>Cancelar</button><button className="admin-btn admin-btn--danger" type="button" onClick={() => void removeGalleryImage(deleteImage)}>Eliminar</button></div></div> : null}</Modal>
    </div>
  );
}

function InfoStep({ editing, destinations, errors, onChange }: { editing: TourEditor; destinations: DestinationRow[]; errors: FieldErrors; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Información general" description="Los datos esenciales que describen el Tour." icon={<Info size={16} />}><div className="admin-form-columns"><label className="admin-field"><span className="admin-field__label">Nombre del tour</span><input className="admin-input" aria-invalid={Boolean(errors.title) || undefined} value={editing.title} onChange={(event) => onChange({ ...editing, title: event.target.value, slug: slugify(event.target.value) })} />{errors.title ? <span className="admin-field-error">{errors.title}</span> : null}</label><label className="admin-field"><span className="admin-field__label">Ubicación</span>{destinations.length ? <select className="admin-select" aria-invalid={Boolean(errors.location) || undefined} value={editing.location} onChange={(event) => onChange({ ...editing, location: event.target.value })}><option value="">Selecciona una ubicación</option>{destinations.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select> : <input className="admin-input" value={editing.location} onChange={(event) => onChange({ ...editing, location: event.target.value })} />}{errors.location ? <span className="admin-field-error">{errors.location}</span> : null}<span className="admin-field-help">El modelo actual admite una ubicación por Tour.</span></label></div><label className="admin-field"><span className="admin-field__label">Frase</span><textarea className="admin-input" rows={3} value={editing.description} onChange={(event) => onChange({ ...editing, description: event.target.value })} />{errors.description ? <span className="admin-field-error">{errors.description}</span> : null}</label><label className="admin-field"><span className="admin-field__label">Descripción</span><textarea className="admin-input admin-textarea-list" value={editing.longDescription} onChange={(event) => onChange({ ...editing, longDescription: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Orden de aparición</span><input className="admin-input" type="number" value={editing.sortOrder} onChange={(event) => onChange({ ...editing, sortOrder: Number(event.target.value) })} /></label></FormSection>;
}

function GalleryStep({ editing, errors, selectedSlot, setSelectedSlot, setDeleteImage, saveImage }: { editing: TourEditor; errors: FieldErrors; selectedSlot: number | null; setSelectedSlot: (value: number | null) => void; setDeleteImage: (value: TourImageRow | null) => void; saveImage: (image: StorageImage, slot: number) => Promise<void> }) {
  return <FormSection title="Galería" description="Mínimo 3 imágenes, máximo 9. El orden define el carrusel y la fotografía #1 es la portada." icon={<ImageIcon size={16} />}>{errors.images ? <div className="admin-alert admin-alert--danger">{errors.images}</div> : null}<div className="admin-tour-image-slots">{Array.from({ length: 9 }, (_, index) => { const image = editing.images[index]; return <article className="admin-tour-image-slot" key={image?.id ?? index}><header><strong>Foto {index + 1}</strong>{index === 0 ? <AdminBadge value="Portada" /> : null}</header>{image ? <img src={image.image_url} alt={image.alt_text || `${editing.title} foto ${index + 1}`} /> : <button className="admin-tour-image-slot__empty" type="button" onClick={() => setSelectedSlot(index)}><Plus size={18} /> Seleccionar</button>}<footer><button className="admin-btn admin-btn--ghost" type="button" onClick={() => setSelectedSlot(index)}>{image ? 'Cambiar' : 'Seleccionar'}</button>{image ? <button className="admin-icon-btn" type="button" aria-label={`Eliminar foto ${index + 1}`} onClick={() => setDeleteImage(image)}><Trash2 size={15} /></button> : null}</footer></article>; })}</div>{selectedSlot !== null ? <div className="admin-gallery-picker"><header><strong>Foto {selectedSlot + 1}{selectedSlot === 0 ? ' · Portada' : ''}</strong><button className="admin-icon-btn" type="button" aria-label="Cerrar selector" onClick={() => setSelectedSlot(null)}><X size={16} /></button></header><AdminImageManager resourceTable="tour_images" resourceId={editing.images[selectedSlot]?.id ?? editing.id} folder="tours" currentImageUrl={editing.images[selectedSlot]?.image_url} currentStoragePath={editing.images[selectedSlot]?.storage_path} label={`${editing.title} foto ${selectedSlot + 1}`} aspect={3 / 2} maxWidth={1200} maxHeight={800} maxSizeMB={0.35} retainPreviousOnUpload onImageSaved={(image) => saveImage(image, selectedSlot)} /></div> : null}</FormSection>;
}

function ExperienceStep({ editing, activityInput, inclusionInput, setActivityInput, setInclusionInput, addActivity, addInclusion, onChange }: { editing: TourEditor; activityInput: string; inclusionInput: string; setActivityInput: (value: string) => void; setInclusionInput: (value: string) => void; addActivity: () => void; addInclusion: () => void; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Actividades e incluye" description="Listas editables sin un máximo artificial." icon={<Check size={16} />}><div className="admin-dynamic-list"><h3>Actividades del Tour</h3>{editing.activities.map((item, index) => <div className="admin-dynamic-list__row" key={index}><input className="admin-input" value={item} onChange={(event) => onChange({ ...editing, activities: editing.activities.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar actividad ${index + 1}`} onClick={() => onChange({ ...editing, activities: editing.activities.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={activityInput} onChange={(event) => setActivityInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addActivity}><Plus size={14} /> Agregar actividad</button></div></div><div className="admin-dynamic-list"><h3>Incluye</h3>{editing.inclusions.filter((item) => !item.pendingDelete).map((item) => <div className="admin-dynamic-list__row" key={item.id}><input className="admin-input" value={item.label} onChange={(event) => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar ${item.label}`} onClick={() => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, pendingDelete: true } : current) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={inclusionInput} onChange={(event) => setInclusionInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addInclusion}><Plus size={14} /> Agregar</button></div></div></FormSection>;
}

function PackagesStep({ editing, boats, packages, errors, editingPackageId, setEditingPackageId, onChange, addPackage, setDeletePackage, validate, setErrors }: { editing: TourEditor; boats: BoatRow[]; packages: EditablePackage[]; errors: FieldErrors; editingPackageId: string | null; setEditingPackageId: (value: string | null) => void; onChange: (value: TourEditor) => void; addPackage: () => void; setDeletePackage: (value: EditablePackage | null) => void; validate: (value: TourEditor, publishing?: boolean) => FieldErrors; setErrors: (value: FieldErrors) => void }) {
  const updatePackage = (id: string, changes: Partial<EditablePackage>) => onChange({ ...editing, packages: editing.packages.map((item) => item.id === id ? { ...item, ...changes } : item) });
  const current = packages.find((item) => item.id === editingPackageId);
  return <FormSection title="Paquetes" description="El bote se asocia al Tour y cada paquete conserva sus condiciones comerciales." icon={<Package size={16} />}><label className="admin-field"><span className="admin-field__label">Bote asociado al Tour</span><select className="admin-select" aria-invalid={Boolean(errors.boat) || undefined} value={editing.boatId} onChange={(event) => { const boat = boats.find((item) => item.id === event.target.value); onChange({ ...editing, boatId: event.target.value, packages: editing.packages.map((item) => ({ ...item, maxGuests: boat ? boat.max_guests : item.maxGuests })) }); }}><option value="">Selecciona un bote</option>{boats.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{errors.boat ? <span className="admin-field-error">{errors.boat}</span> : null}</label>{errors.packages ? <div className="admin-alert admin-alert--danger">{errors.packages}</div> : null}<div className="admin-package-previews">{packages.map((item) => <article className="admin-package-preview" key={item.id}><div><strong>{item.name || 'Paquete sin nombre'}</strong><span>{item.active ? 'Activo' : 'Inactivo'} · {item.durationHours} h · USD {item.basePrice || '0'}</span></div><div className="admin-package-preview__actions"><button className="admin-icon-btn" type="button" title={item.active ? 'Desactivar' : 'Activar'} aria-label={item.active ? `Desactivar ${item.name}` : `Activar ${item.name}`} onClick={() => updatePackage(item.id, { active: !item.active })}>{item.active ? <Eye size={16} /> : <EyeOff size={16} />}</button><button className="admin-icon-btn" type="button" title="Editar" aria-label={`Editar ${item.name}`} onClick={() => setEditingPackageId(item.id)}><Pencil size={16} /></button><button className="admin-icon-btn" type="button" title="Eliminar" aria-label={`Eliminar ${item.name}`} onClick={() => setDeletePackage(item)}><Trash2 size={16} /></button></div></article>)}</div>{current ? <div className="admin-package-compact-editor"><h3>{current.isNew ? 'Agregar paquete' : `Editar ${current.name}`}</h3><div className="admin-form-columns"><label className="admin-field"><span className="admin-field__label">Nombre</span><input className="admin-input" value={current.name} onChange={(event) => updatePackage(current.id, { name: event.target.value, packageType: slugify(event.target.value) })} />{errors[`package-${current.id}-name`] ? <span className="admin-field-error">{errors[`package-${current.id}-name`]}</span> : null}</label><label className="admin-field"><span className="admin-field__label">Cantidad de horas</span><input className="admin-input" type="number" min={0.5} step={0.5} value={current.durationHours} onChange={(event) => updatePackage(current.id, { durationHours: Number(event.target.value) })} /></label><label className="admin-field"><span className="admin-field__label">Precio</span><input className="admin-input admin-input--manual-number" type="number" min={0} step="any" value={current.basePrice} onChange={(event) => updatePackage(current.id, { basePrice: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Personas incluidas</span><input className="admin-input" type="number" min={1} value={current.includedGuests} onChange={(event) => updatePackage(current.id, { includedGuests: Number(event.target.value) })} /></label><label className="admin-field"><span className="admin-field__label">Extra por persona adicional</span><input className="admin-input" type="number" min={0} value={current.extraGuestPrice} onChange={(event) => updatePackage(current.id, { extraGuestPrice: Number(event.target.value) })} /></label></div><div className="admin-actions"><button className="admin-btn admin-btn--secondary" type="button" onClick={() => setEditingPackageId(null)}>Cancelar</button><button className="admin-btn" type="button" onClick={() => { const nextErrors = validate(editing, false); setErrors(nextErrors); if (!Object.keys(nextErrors).some((key) => key.startsWith(`package-${current.id}-`))) setEditingPackageId(null); }}><Check size={15} /> Agregar</button></div></div> : <button className="admin-btn admin-btn--secondary" type="button" onClick={addPackage}><Plus size={15} /> Agregar paquete</button>}</FormSection>;
}
