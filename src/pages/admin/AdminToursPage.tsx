import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, Info, Loader2, Package, Pencil, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminReorderHandle, AdminReorderToolbar, AdminTable } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage, type StorageImage } from '../../services/imageService';
import { friendlyDeleteError } from '../../utils/adminErrors';
import type { Tables } from '../../types/supabase';

type TourRow = Tables<'tours'>;
type BoatRow = Pick<Tables<'boats'>, 'id' | 'name' | 'max_guests' | 'active' | 'sort_order'>;
type BoatTourRow = Tables<'boat_tours'>;
type PackageRow = Tables<'tour_packages'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;
type PublicationStatus = 'draft' | 'published' | 'inactive';
type EditorStep = 'info' | 'gallery' | 'experience' | 'packages' | 'config';

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
  { id: 'config', label: 'Configuración' },
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

function createEditor(tour: TourRow, packages: PackageRow[], relations: BoatTourRow[], images: TourImageRow[], inclusions: TourInclusionRow[]): TourEditor {
  const boatByBoatTour = new Map(relations.map((relation) => [relation.id, relation.boat_id]));
  return {
    id: tour.id, title: tour.title, slug: tour.slug,
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PublicationStatus>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function loadTours() {
    setLoading(true);
    const [tourResult, boatResult, relationResult, packageResult, imageResult, inclusionResult] = await Promise.all([
      supabase.from('tours').select('*').order('sort_order'),
      supabase.from('boats').select('id, name, max_guests, active, sort_order').order('sort_order'),
      supabase.from('boat_tours').select('*').order('sort_order'),
      supabase.from('tour_packages').select('*').order('sort_order'),
      supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
      supabase.from('tour_inclusions').select('*').order('sort_order'),
    ]);
    setLoading(false);
    const loadError = tourResult.error ?? boatResult.error ?? relationResult.error ?? packageResult.error ?? imageResult.error ?? inclusionResult.error;
    if (loadError) { setError(loadError.message); return; }
    setTours(tourResult.data ?? []); setBoats(boatResult.data ?? []);
    setRelations(relationResult.data ?? []); setPackageRows(packageResult.data ?? []); setImageRows(imageResult.data ?? []); setInclusionRows(inclusionResult.data ?? []);
  }

  useEffect(() => { void loadTours(); }, []);

  function markEditing(next: TourEditor) { setEditing(next); setDirty(true); }

  function openEditor(tour: TourRow) {
    const tourRelations = relations.filter((item) => item.tour_id === tour.id);
    setEditing(createEditor(tour, packageRows.filter((item) => tourRelations.some((relation) => relation.id === item.boat_tour_id)), tourRelations, imageRows.filter((item) => item.tour_id === tour.id), inclusionRows.filter((item) => item.tour_id === tour.id)));
    setStep('info'); setFieldErrors({}); setGallerySlot(null); setDirty(false); setError('');
  }

  async function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error: insertError } = await supabase.from('tours').insert({ id, title: 'Nuevo tour', slug: id, category: 'Snorkeling & Beach', publication_status: 'draft', active: false, featured: false, rating: 5, sort_order: tours.length + 1, description: '', long_description: '', highlights: [], included: [] }).select('*').single();
    if (insertError) { setError(insertError.message); return; }
    await loadTours(); setEditing(createEditor(data, [], [], [], [])); setStep('info'); setDirty(true);
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
      setError(friendlyDeleteError(deleteError, 'este tour'));
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
    if (editor.images.length < 3 || editor.images.length > 6) errors.images = 'Para finalizar se requieren entre 3 y 6 fotografías.';
    return errors;
  }

  // `tours.location` and `tour_locations` are no longer written here — the
  // "Ubicaciones" feature was retired from the Admin (no public consumer
  // ever read either). Existing values are left exactly as they are in the
  // database; this simply stops touching them.
  async function persistInfo(editor: TourEditor) {
    const { error: tourError } = await supabase.from('tours').update({ title: editor.title.trim(), slug: editor.slug, description: editor.description.trim(), long_description: editor.longDescription.trim() || null, category: editor.category, sort_order: editor.sortOrder, updated_at: new Date().toISOString() }).eq('id', editor.id);
    if (tourError) throw new Error(tourError.message);
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

  // "Guardar borrador" — available on every step, unlike "Finalizar" which
  // only validates once all steps are done. Persists whatever is filled in
  // so far and forces the tour back to draft/hidden; nothing here requires
  // the full set of publish-only fields (photos, etc.).
  async function saveDraftAndClose() {
    if (!editing || saving) return;
    if (!editing.title.trim()) {
      setFieldErrors({ title: 'El nombre del tour es obligatorio.' });
      setStep('info');
      setError('Completa el nombre antes de guardar el borrador.');
      return;
    }
    setSaving(true); setError('');
    try {
      await persistInfo(editing); await persistExperience(editing);
      const { error } = await supabase.from('tours').update({ publication_status: 'draft', active: false, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) throw new Error(error.message);
      setSaving(false); setDirty(false); setEditing(null); setNotice('Borrador guardado.'); await loadTours();
    } catch (caught) {
      setSaving(false);
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el borrador.');
    }
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
    if (slot === 0) {
      const { error: coverError } = await supabase.from('tours').update({
        image_url: result.data.image_url,
        image_public_id: result.data.storage_path,
        image_alt: result.data.alt_text || editing.title,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      if (coverError) throw new Error(coverError.message);
    }
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
      // Las fotos son requisito para activar el tour, pero no deben bloquear el acceso a Paquetes.
      setFieldErrors(errors); if (Object.keys(errors).length) return;
      if (!(await persistStep())) return;
    }
    const index = steps.findIndex((item) => item.id === step);
    setStep(steps[Math.max(0, Math.min(3, index + direction))].id);
  }

  const boatNamesByTour = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const relation of relations) {
      const boat = boats.find((item) => item.id === relation.boat_id);
      if (boat) names.set(relation.tour_id, [...(names.get(relation.tour_id) ?? []), boat.name]);
    }
    return names;
  }, [boats, relations]);
  const visibleTours = tours
    .filter((tour) => statusFilter === 'all' || publicationStatus(tour) === statusFilter)
    .filter((tour) => `${tour.title} ${(boatNamesByTour.get(tour.id) ?? []).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const visiblePackages = useMemo(() => editing?.packages.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [editing]);
  const reorder = useAdminReorder<TourRow>(tours);
  const canReorder = search.trim() === '' && statusFilter === 'all';

  async function persistTourOrder(updates: Array<{ id: string; sort_order: number }>) {
    for (const update of updates) {
      const { error } = await supabase.from('tours').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) { setError(error.message); throw new Error(error.message); }
    }
    setNotice('Orden actualizado.');
    await loadTours();
  }

  return (
    <div className="admin-page">
      <AdminModuleSurface className="admin-tours-surface">
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar tour por nombre o ubicación"
          filters={
            <AdminFilterMenu panelLabel="Filtros de tours" panelDescription="Refina la lista de tours." activeCount={Number(statusFilter !== 'all')} onReset={() => setStatusFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Publicación</span>
                <select className="admin-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PublicationStatus)}>
                  <option value="all">Todos</option>
                  <option value="published">Activo</option>
                  <option value="draft">Borrador</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
            </AdminFilterMenu>
          }
          primaryAction={<button className="admin-btn" type="button" disabled={reorder.reordering} onClick={() => void createTour()}><Plus size={16} /> Crear tour</button>}
          secondaryActions={
            <AdminReorderToolbar
              reordering={reorder.reordering}
              saving={reorder.saving}
              onStart={() => reorder.start()}
              onCancel={reorder.cancel}
              onSave={() => void reorder.save(persistTourOrder)}
              disabledReason={canReorder ? undefined : 'Limpia la búsqueda y el filtro de publicación para reordenar.'}
            />
          }
        />
        {error && !editing ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
        {notice && !editing ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
        {loading ? <p className="admin-muted">Cargando tours...</p> : (
          <AdminTable embedded headers={['Tour', 'Botes', 'Publicación', 'Orden', 'Acciones']}>
            {(reorder.reordering ? reorder.order : visibleTours).map((tour, index) => (
              <tr
                key={tour.id}
                className={reorder.reordering ? `admin-sortable-row${reorder.dragId === tour.id ? ' admin-sortable-row--dragging' : ''}` : undefined}
                {...(reorder.reordering ? reorder.dragHandlers(tour.id) : {})}
              >
                <td>{tour.title}<div className="admin-muted admin-table__truncate" title={tour.description || tour.slug}>{tour.description || tour.slug}</div></td>
                <td>{(boatNamesByTour.get(tour.id) ?? []).length ? (boatNamesByTour.get(tour.id) ?? []).join(', ') : <span className="admin-muted">Sin bote asignado</span>}</td>
                <td><AdminBadge value={publicationStatus(tour) === 'draft' ? 'Borrador' : publicationStatus(tour) === 'published' ? 'Activo' : 'Inactivo'} /></td>
                <td>
                  {reorder.reordering ? (
                    <AdminReorderHandle
                      position={index + 1}
                      total={reorder.order.length}
                      dragging={reorder.dragId === tour.id}
                      onMoveUp={() => reorder.moveBy(tour.id, -1)}
                      onMoveDown={() => reorder.moveBy(tour.id, 1)}
                    />
                  ) : tour.sort_order}
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-icon-action" type="button" disabled={reorder.reordering} title="Editar tour" aria-label={`Editar tour ${tour.title}`} onClick={() => openEditor(tour)}><Pencil size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleTours.length === 0 ? <tr><td colSpan={5} className="admin-muted">No hay tours para esta búsqueda.</td></tr> : null}
          </AdminTable>
        )}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={requestClose} titleId="tour-edit-title" className="admin-tour-modal">
        {editing ? <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); void finishTour(); }}>
          <header className="admin-modal-header"><div><h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> {editing.title}</h2><p className="admin-muted">{steps.findIndex((item) => item.id === step) + 1} de {steps.length} · {steps.find((item) => item.id === step)?.label}</p></div><button className="admin-icon-btn" type="button" aria-label="Cerrar editor" onClick={requestClose}><X size={18} /></button></header>
          <ol className="admin-stepper" aria-label="Progreso del Tour">{steps.map((item, index) => <li key={item.id} aria-current={step === item.id ? 'step' : undefined} className={step === item.id ? 'admin-stepper__item admin-stepper__item--active' : 'admin-stepper__item'}><button type="button" onClick={() => setStep(item.id)}><span>{index + 1}</span><strong>{item.label}</strong></button></li>)}</ol>
          <div className="admin-modal-body admin-tour-step-body">{error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
            {step === 'info' ? <InfoStep editing={editing} errors={fieldErrors} onChange={markEditing} /> : null}
            {step === 'gallery' ? <GalleryStep editing={editing} errors={fieldErrors} selectedSlot={gallerySlot} setSelectedSlot={setGallerySlot} setDeleteImage={setDeleteImage} saveImage={saveGalleryImage} /> : null}
            {step === 'experience' ? <ExperienceStep editing={editing} activityInput={activityInput} inclusionInput={inclusionInput} setActivityInput={setActivityInput} setInclusionInput={setInclusionInput} addActivity={addActivity} addInclusion={addInclusion} onChange={markEditing} /> : null}
            {step === 'packages' ? <PackagesStep boats={boats} relations={relations.filter((relation) => relation.tour_id === editing.id)} packages={visiblePackages} onManageBoat={(boatId) => navigate(boatId ? `/admin/boats?boatId=${boatId}` : '/admin/boats')} /> : null}
            {step === 'config' ? <ConfigStep tour={tours.find((item) => item.id === editing.id) ?? null} togglingTourId={togglingTourId} onToggle={toggleTourPublication} onRequestDelete={setPendingTourDelete} /> : null}
          </div>
          <ModalFooter>
            <button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={requestClose}>Cancelar</button>
            <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => void saveDraftAndClose()}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Guardar borrador</button>
            {step !== 'info' ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void navigateStep(-1)}><ChevronLeft size={15} /> Anterior</button> : null}
            {step !== 'config' ? <button className="admin-btn" type="button" disabled={saving} onClick={() => void navigateStep(1)}>{saving ? <Loader2 className="animate-spin" size={15} /> : null} Siguiente <ChevronRight size={15} /></button> : <button className="admin-btn" type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Guardar</button>}
          </ModalFooter>
        </form> : null}
      </Modal>

      <AdminConfirmDialog
        open={Boolean(deleteImage)}
        onClose={() => setDeleteImage(null)}
        onConfirm={() => deleteImage && removeGalleryImage(deleteImage)}
        titleId="image-delete-title"
        title="Eliminar fotografía"
        message="Las siguientes fotografías se reordenarán automáticamente."
      />

      <AdminConfirmDialog
        open={Boolean(pendingTourDelete)}
        onClose={() => setPendingTourDelete(null)}
        onConfirm={() => pendingTourDelete && deleteTour(pendingTourDelete)}
        titleId="tour-delete-title"
        title="Eliminar tour"
        loading={deletingTour}
        message={pendingTourDelete ? `Esta acción elimina "${pendingTourDelete.title}" y sus paquetes asociados. Si tiene reservas históricas, la base de datos bloqueará la eliminación.` : ''}
      />
    </div>
  );
}

function InfoStep({ editing, errors, onChange }: { editing: TourEditor; errors: FieldErrors; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Información general" description="Los datos esenciales que describen el Tour." icon={<Info size={16} />}><label className="admin-field"><span className="admin-field__label">Nombre del tour</span><input className="admin-input" aria-invalid={Boolean(errors.title) || undefined} value={editing.title} onChange={(event) => onChange({ ...editing, title: event.target.value, slug: slugify(event.target.value) })} />{errors.title ? <span className="admin-field-error">{errors.title}</span> : null}</label><label className="admin-field"><span className="admin-field__label">Frase</span><textarea className="admin-input" rows={3} value={editing.description} onChange={(event) => onChange({ ...editing, description: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Descripción</span><textarea className="admin-input admin-textarea-list" value={editing.longDescription} onChange={(event) => onChange({ ...editing, longDescription: event.target.value })} /></label><p className="admin-field-help">Orden de aparición actual: {editing.sortOrder}. Se reordena desde la lista de tours.</p></FormSection>;
}

function GalleryStep({ editing, errors, selectedSlot, setSelectedSlot, setDeleteImage, saveImage }: { editing: TourEditor; errors: FieldErrors; selectedSlot: number | null; setSelectedSlot: (value: number | null) => void; setDeleteImage: (value: TourImageRow | null) => void; saveImage: (image: StorageImage, slot: number) => Promise<void> }) {
  return <FormSection title="Galería" description="Mínimo 3 imágenes para continuar. Para finalizar: 3 o 6. Máximo 6." icon={<ImageIcon size={16} />}>{errors.images ? <div className="admin-alert admin-alert--danger">{errors.images}</div> : null}<div className="admin-tour-image-slots">{Array.from({ length: 6 }, (_, index) => { const image = editing.images[index]; const selected = selectedSlot === index; return <article className={`admin-tour-image-slot${selected ? ' admin-tour-image-slot--editing' : ''}`} key={image?.id ?? index}><header><strong>Foto {index + 1}</strong>{index === 0 ? <AdminBadge value="Portada" /> : null}</header>{selected ? <AdminImageManager resourceTable="tours" resourceId={editing.id} folder="tours" currentImageUrl={image?.image_url} currentStoragePath={image?.storage_path} label={`${editing.title} foto ${index + 1}`} aspect={3 / 2} maxWidth={1200} maxHeight={800} maxSizeMB={0.35} retainPreviousOnUpload requireReplacementToDelete onImageSaved={(saved) => saveImage(saved, index)} /> : image ? <button className="admin-tour-image-slot__media" type="button" aria-label={`Cambiar foto ${index + 1}`} onClick={() => setSelectedSlot(index)}><img src={image.image_url} alt={image.alt_text || `${editing.title} foto ${index + 1}`} /></button> : <button className="admin-tour-image-slot__empty" type="button" onClick={() => setSelectedSlot(index)}><Plus size={18} /> Seleccionar</button>}<footer>{selected ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setSelectedSlot(null)}>Cerrar</button> : <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setSelectedSlot(index)}>{image ? 'Cambiar' : 'Seleccionar'}</button>}{image && !selected ? <button className="admin-icon-btn" type="button" aria-label={`Eliminar foto ${index + 1}`} onClick={() => setDeleteImage(image)}><Trash2 size={15} /></button> : null}</footer></article>; })}</div></FormSection>;
}

function ExperienceStep({ editing, activityInput, inclusionInput, setActivityInput, setInclusionInput, addActivity, addInclusion, onChange }: { editing: TourEditor; activityInput: string; inclusionInput: string; setActivityInput: (value: string) => void; setInclusionInput: (value: string) => void; addActivity: () => void; addInclusion: () => void; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Actividades e incluye" description="Listas editables sin un máximo artificial." icon={<Check size={16} />}><div className="admin-dynamic-list"><h3>Actividades del Tour</h3>{editing.activities.map((item, index) => <div className="admin-dynamic-list__row" key={index}><input className="admin-input" value={item} onChange={(event) => onChange({ ...editing, activities: editing.activities.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar actividad ${index + 1}`} onClick={() => onChange({ ...editing, activities: editing.activities.filter((_, currentIndex) => currentIndex !== index) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={activityInput} onChange={(event) => setActivityInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addActivity}><Plus size={14} /> Agregar actividad</button></div></div><div className="admin-dynamic-list"><h3>Incluye</h3>{editing.inclusions.filter((item) => !item.pendingDelete).map((item) => <div className="admin-dynamic-list__row" key={item.id}><input className="admin-input" value={item.label} onChange={(event) => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, label: event.target.value } : current) })} /><button className="admin-icon-btn" type="button" aria-label={`Eliminar ${item.label}`} onClick={() => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, pendingDelete: true } : current) })}><Trash2 size={15} /></button></div>)}<div className="admin-list-editor__add"><input className="admin-input" value={inclusionInput} onChange={(event) => setInclusionInput(event.target.value)} /><button className="admin-btn admin-btn--secondary" type="button" onClick={addInclusion}><Plus size={14} /> Agregar</button></div></div></FormSection>;
}

function PackagesStep({ boats, relations, packages, onManageBoat }: { boats: BoatRow[]; relations: BoatTourRow[]; packages: EditablePackage[]; onManageBoat: (boatId: string | null) => void }) {
  const boatName = (boatId: string | null) => boats.find((item) => item.id === boatId)?.name ?? boatId ?? 'Sin bote asignado';
  const groups = new Map<string | null, EditablePackage[]>();
  for (const relation of relations) groups.set(relation.boat_id, []);
  for (const item of packages) {
    const list = groups.get(item.boatId) ?? [];
    list.push(item);
    groups.set(item.boatId, list);
  }
  return (
    <FormSection
      title="Paquetes"
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

// Same immediate, standalone actions the table row used to expose
// directly (toggle takes effect on click, independent of the wizard's own
// "Finalizar" save) — only their location moved, not when/how they run.
function ConfigStep({ tour, togglingTourId, onToggle, onRequestDelete }: { tour: TourRow | null; togglingTourId: string | null; onToggle: (tour: TourRow) => void | Promise<void>; onRequestDelete: (tour: TourRow) => void }) {
  if (!tour) return null;
  const status = publicationStatus(tour);
  const isPublished = status === 'published';
  return (
    <>
      <FormSection title="Visibilidad" description="Controla si este tour se muestra en el sitio público." icon={<Settings size={16} />}>
        <div className="admin-config-row">
          <div>
            <p className="admin-config-row__label">Estado actual</p>
            <AdminBadge value={status === 'draft' ? 'Borrador' : isPublished ? 'Activo' : 'Inactivo'} />
          </div>
          <button
            className={`admin-btn ${isPublished ? 'admin-btn--secondary' : ''}`}
            type="button"
            disabled={togglingTourId === tour.id}
            onClick={() => void onToggle(tour)}
          >
            {togglingTourId === tour.id ? <Loader2 className="animate-spin" size={15} /> : isPublished ? <EyeOff size={15} /> : <Eye size={15} />}
            {isPublished ? 'Ocultar tour' : 'Mostrar tour'}
          </button>
        </div>
        <p className="admin-muted admin-config-row__hint">
          {isPublished ? 'Visible: aparece en el sitio público y se puede reservar.' : 'Oculto: no aparece en el sitio público ni se puede reservar.'}
        </p>
      </FormSection>
      <FormSection title="Zona de peligro" description="Esta acción no se puede deshacer." icon={<Trash2 size={16} />}>
        <div className="admin-danger-zone">
          <p className="admin-muted">Elimina este tour y sus paquetes asociados. Si tiene reservas históricas, la base de datos bloqueará la eliminación.</p>
          <button className="admin-btn admin-btn--danger" type="button" onClick={() => onRequestDelete(tour)}>
            <Trash2 size={15} /> Eliminar tour
          </button>
        </div>
      </FormSection>
    </>
  );
}
