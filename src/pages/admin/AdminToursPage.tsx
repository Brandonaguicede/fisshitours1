import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable, AdminToolbar } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import ToggleSwitch from '../../components/admin/ToggleSwitch';
import { Modal } from '../../components/common/Modal';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage, type StorageImage } from '../../services/imageService';
import type { Database, Tables } from '../../types/supabase';

type TourRow = Tables<'tours'>;
type BoatRow = Pick<Tables<'boats'>, 'id' | 'name' | 'image_url' | 'max_guests' | 'active' | 'sort_order'>;
type BoatTourRow = Tables<'boat_tours'>;
type PackageRow = Tables<'tour_packages'>;
type DestinationRow = Pick<Tables<'destinations'>, 'id' | 'name' | 'active' | 'sort_order'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;

type PublicationStatus = 'draft' | 'published' | 'inactive';
type EditorTab = 'info' | 'experience' | 'packages' | 'publishing';

interface EditablePackage {
  id: string;
  boatTourId: string | null;
  boatId: string;
  name: string;
  packageType: string;
  durationValue: number;
  durationUnit: 'hours' | 'days';
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  customQuote: boolean;
  description: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  sortOrder: number;
  active: boolean;
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
  imageUrl: string | null;
  imagePublicId: string | null;
  imageAlt: string;
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

const categories = ['Fishing', 'Snorkeling & Beach', 'Surfing', 'Bioluminescence', 'Water Toys'];
const tabs: Array<{ id: EditorTab; label: string }> = [
  { id: 'info', label: 'Informacion' },
  { id: 'experience', label: 'Experiencia' },
  { id: 'packages', label: 'Paquetes' },
  { id: 'publishing', label: 'Publicacion' },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `tour-${Date.now()}`;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function toPublicationStatus(tour: TourRow): PublicationStatus {
  const status = tour.publication_status;
  if (status === 'draft' || status === 'published' || status === 'inactive') return status;
  return tour.active ? 'published' : 'inactive';
}

function minutesToDuration(value: number | null): { durationValue: number; durationUnit: 'hours' | 'days' } {
  if (!value) return { durationValue: 4, durationUnit: 'hours' };
  if (value >= 1440 && value % 1440 === 0) return { durationValue: value / 1440, durationUnit: 'days' };
  return { durationValue: Math.round((value / 60) * 100) / 100, durationUnit: 'hours' };
}

function durationToMinutes(value: number, unit: 'hours' | 'days') {
  return Math.round(value * (unit === 'days' ? 1440 : 60));
}

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

function packageLabel(pkg: EditablePackage) {
  return `${pkg.name || 'Duracion sin nombre'} - ${pkg.durationValue || 0} ${pkg.durationUnit === 'hours' ? 'h' : 'dia(s)'}`;
}

function createEditor(tour: TourRow, packageRows: PackageRow[], boatTours: BoatTourRow[], images: TourImageRow[], inclusions: TourInclusionRow[]): TourEditor {
  return {
    id: tour.id,
    title: tour.title,
    slug: tour.slug,
    location: tour.location ?? '',
    description: tour.description ?? '',
    longDescription: tour.long_description ?? '',
    imageUrl: tour.image_url,
    imagePublicId: tour.image_public_id,
    imageAlt: tour.image_alt ?? tour.title,
    category: tour.category,
    publicationStatus: toPublicationStatus(tour),
    featured: tour.featured,
    sortOrder: tour.sort_order,
    activities: jsonStringArray(tour.highlights),
    images,
    packages: packageRows
      .map((pkg) => {
        const relation = boatTours.find((item) => item.id === pkg.boat_tour_id);
        const duration = minutesToDuration(pkg.duration_minutes);
        return {
          id: pkg.id,
          boatTourId: pkg.boat_tour_id,
          boatId: relation?.boat_id ?? '',
          name: pkg.name,
          packageType: pkg.package_type,
          durationValue: duration.durationValue,
          durationUnit: duration.durationUnit,
          basePrice: Number(pkg.base_price),
          includedGuests: pkg.included_guests,
          maxGuests: pkg.max_guests,
          extraGuestPrice: Number(pkg.extra_guest_price),
          customQuote: pkg.custom_quote,
          description: pkg.description ?? '',
          imageUrl: pkg.image_url,
          imagePublicId: pkg.image_public_id,
          sortOrder: pkg.sort_order,
          active: pkg.active,
          isNew: false,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
    inclusions: inclusions
      .map((item) => ({
        id: item.id,
        label: item.label,
        packageId: item.tour_package_id,
        sortOrder: item.sort_order,
        active: item.active,
        isNew: false,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export default function AdminToursPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tours, setTours] = useState<TourRow[]>([]);
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [boatTours, setBoatTours] = useState<BoatTourRow[]>([]);
  const [tourPackages, setTourPackages] = useState<PackageRow[]>([]);
  const [tourImages, setTourImages] = useState<TourImageRow[]>([]);
  const [tourInclusions, setTourInclusions] = useState<TourInclusionRow[]>([]);
  const [editing, setEditing] = useState<TourEditor | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('info');
  const [activityInput, setActivityInput] = useState('');
  const [inclusionInput, setInclusionInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletePackage, setDeletePackage] = useState<EditablePackage | null>(null);
  const [deleteImage, setDeleteImage] = useState<TourImageRow | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);

  async function loadTours() {
    setLoading(true);
    setError('');
    const [toursRes, boatsRes, destinationsRes, boatToursRes, packagesRes, imagesRes, inclusionsRes] = await Promise.all([
      supabase.from('tours').select('*').order('sort_order'),
      supabase.from('boats').select('id, name, image_url, max_guests, active, sort_order').order('sort_order'),
      supabase.from('destinations').select('id, name, active, sort_order').eq('active', true).order('sort_order'),
      supabase.from('boat_tours').select('*').order('sort_order'),
      supabase.from('tour_packages').select('*').order('sort_order'),
      supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
      supabase.from('tour_inclusions').select('*').order('sort_order'),
    ]);

    setLoading(false);
    const firstError = toursRes.error ?? boatsRes.error ?? destinationsRes.error ?? boatToursRes.error ?? packagesRes.error ?? imagesRes.error ?? inclusionsRes.error;
    if (firstError) {
      setError(firstError.message);
      setTours([]);
      return;
    }

    setTours(toursRes.data ?? []);
    setBoats(boatsRes.data ?? []);
    setDestinations(destinationsRes.data ?? []);
    setBoatTours(boatToursRes.data ?? []);
    setTourPackages(packagesRes.data ?? []);
    setTourImages(imagesRes.data ?? []);
    setTourInclusions(inclusionsRes.data ?? []);
  }

  useEffect(() => {
    void loadTours();
  }, []);

  useEffect(() => {
    const tourId = searchParams.get('tourId');
    if (!tourId || loading || editing) return;
    const tour = tours.find((item) => item.id === tourId);
    if (!tour) return;
    openEditor(tour);
    if (searchParams.get('tab') === 'packages') setActiveTab('packages');
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tours, loading, searchParams]);

  function markEditing(next: TourEditor) {
    setEditing(next);
    setDirty(true);
  }

  function openEditor(tour: TourRow) {
    setEditing(createEditor(
      tour,
      tourPackages.filter((pkg) => boatTours.some((relation) => relation.id === pkg.boat_tour_id && relation.tour_id === tour.id)),
      boatTours,
      tourImages.filter((image) => image.tour_id === tour.id),
      tourInclusions.filter((item) => item.tour_id === tour.id),
    ));
    setActiveTab('info');
    setFieldErrors({});
    setDirty(false);
  }

  async function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    const title = 'Nuevo tour';
    const { data, error } = await supabase
      .from('tours')
      .insert({
        id,
        title,
        slug: id,
        category: 'Snorkeling & Beach',
        publication_status: 'draft',
        active: false,
        featured: false,
        rating: 5,
        sort_order: tours.length + 1,
        description: '',
        long_description: '',
        highlights: [],
        included: [],
      })
      .select('*')
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    await loadTours();
    setEditing(createEditor(data, [], boatTours, [], []));
    setActiveTab('info');
    setDirty(false);
  }

  function requestClose() {
    if (dirty && !window.confirm('Hay cambios sin guardar. Si cierras ahora, se perderan.')) return;
    setEditing(null);
    setFieldErrors({});
    setDirty(false);
  }

  function validateEditor(editor: TourEditor) {
    const errors: FieldErrors = {};
    if (!editor.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
    if (!editor.description.trim()) errors.description = 'La descripcion corta es obligatoria.';
    if (!editor.slug.trim() || !/^[a-z0-9-]+$/.test(editor.slug)) errors.slug = 'Usa solo letras minusculas, numeros y guiones.';
    if (tours.some((tour) => tour.id !== editor.id && tour.slug === editor.slug.trim())) errors.slug = 'Ya existe otro tour con este slug.';
    editor.packages.forEach((pkg) => {
      if (pkg.pendingDelete) return;
      if (!pkg.name.trim()) errors[`package-${pkg.id}-name`] = 'El nombre visible es obligatorio.';
      if (!pkg.boatId) errors[`package-${pkg.id}-boat`] = 'Selecciona el barco al que aplica este paquete.';
      if (!pkg.customQuote) {
        if (!Number.isFinite(pkg.durationValue) || pkg.durationValue <= 0) errors[`package-${pkg.id}-duration`] = 'La duracion debe ser mayor a cero.';
        if (!Number.isFinite(pkg.basePrice) || pkg.basePrice < 0) errors[`package-${pkg.id}-price`] = 'El precio base no puede ser negativo.';
      }
      if (!Number.isFinite(pkg.includedGuests) || pkg.includedGuests < 1) errors[`package-${pkg.id}-included`] = 'Debe incluir al menos 1 persona.';
      if (!Number.isFinite(pkg.maxGuests) || pkg.maxGuests < pkg.includedGuests) errors[`package-${pkg.id}-max`] = 'La capacidad maxima no puede ser menor a las personas incluidas.';
      if (!Number.isFinite(pkg.extraGuestPrice) || pkg.extraGuestPrice < 0) errors[`package-${pkg.id}-extra`] = 'El precio adicional no puede ser negativo.';
    });
    return errors;
  }

  async function ensureBoatTour(tourId: string, boatId: string) {
    const existing = boatTours.find((item) => item.tour_id === tourId && item.boat_id === boatId);
    if (existing) return existing.id;
    const { data: current, error: currentError } = await supabase
      .from('boat_tours')
      .select('id')
      .eq('tour_id', tourId)
      .eq('boat_id', boatId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (current) return current.id;
    // boat_tours.active is derived automatically from tour_packages by a database trigger,
    // so it is intentionally not set here.
    const { data, error } = await supabase
      .from('boat_tours')
      .insert({ boat_id: boatId, tour_id: tourId, active: false, sort_order: boatTours.length + 1 })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async function saveEditor(statusOverride?: PublicationStatus) {
    if (!editing || saving) return;
    const nextEditor = statusOverride ? { ...editing, publicationStatus: statusOverride } : editing;
    const errors = validateEditor(nextEditor);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Revisa los campos marcados antes de guardar.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const status = nextEditor.publicationStatus;
      const active = status === 'published';
      const { error: tourError } = await supabase
        .from('tours')
        .update({
          title: nextEditor.title.trim(),
          slug: nextEditor.slug.trim(),
          location: nextEditor.location.trim() || null,
          description: nextEditor.description.trim(),
          long_description: nextEditor.longDescription.trim() || null,
          image_url: nextEditor.imageUrl,
          image_public_id: nextEditor.imagePublicId,
          image_alt: nextEditor.imageAlt.trim() || nextEditor.title.trim(),
          category: nextEditor.category,
          publication_status: status,
          active,
          featured: nextEditor.featured,
          sort_order: nextEditor.sortOrder,
          highlights: nextEditor.activities,
          included: nextEditor.inclusions.filter((item) => !item.pendingDelete && item.active && item.packageId === null).map((item) => item.label.trim()),
          updated_at: new Date().toISOString(),
        })
        .eq('id', nextEditor.id);
      if (tourError) throw new Error(tourError.message);

      // tour_packages is the single source of truth for commercial terms (price, duration,
      // included guests, extra guest price, max capacity) of a Tour+Boat+Package combination.
      // Nothing here is copied from `boats` — boat_tours.active is derived automatically by a
      // database trigger from which packages are active, so it is never toggled manually either.
      for (const pkg of nextEditor.packages) {
        if (pkg.pendingDelete) {
          if (!pkg.isNew) {
            const { error } = await supabase.from('tour_packages').delete().eq('id', pkg.id);
            if (error) throw new Error(`${error.message}. Si el paquete tiene reservas historicas, desactivalo en lugar de eliminarlo.`);
          }
          continue;
        }

        const boatTourId = await ensureBoatTour(nextEditor.id, pkg.boatId);
        const { error } = await supabase.from('tour_packages').upsert({
          id: pkg.id,
          boat_tour_id: boatTourId,
          name: pkg.name.trim(),
          package_type: pkg.packageType.trim() || slugify(pkg.name),
          description: pkg.description.trim() || null,
          duration_minutes: durationToMinutes(pkg.durationValue, pkg.durationUnit),
          base_price: pkg.basePrice,
          included_guests: pkg.includedGuests,
          max_guests: pkg.maxGuests,
          extra_guest_price: pkg.extraGuestPrice,
          custom_quote: pkg.customQuote,
          image_url: pkg.imageUrl,
          image_public_id: pkg.imagePublicId,
          active: pkg.active,
          sort_order: pkg.sortOrder,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }

      for (const item of nextEditor.inclusions) {
        if (item.pendingDelete) {
          if (!item.isNew) {
            const { error } = await supabase.from('tour_inclusions').delete().eq('id', item.id);
            if (error) throw new Error(error.message);
          }
          continue;
        }
        if (!item.label.trim()) continue;
        const { error } = await supabase.from('tour_inclusions').upsert({
          id: item.id,
          tour_id: nextEditor.id,
          tour_package_id: item.packageId,
          label: item.label.trim(),
          sort_order: item.sortOrder,
          active: item.active,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }

      for (const image of nextEditor.images) {
        const { error } = await supabase
          .from('tour_images')
          .update({
            alt_text: image.alt_text.trim() || nextEditor.title.trim(),
            sort_order: image.sort_order,
            is_primary: image.image_url === nextEditor.imageUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', image.id);
        if (error) throw new Error(error.message);
      }

      await loadTours();
      setSaving(false);
      setNotice(status === 'published' ? 'Tour publicado y actualizado.' : 'Tour guardado.');
      setDirty(false);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'No se pudo guardar el tour.');
    }
  }

  async function onMainImageSaved(image: StorageImage) {
    if (!editing) return;
    const next = { ...editing, imageUrl: image.public_url, imagePublicId: image.storage_path };
    markEditing(next);
    const { error } = await supabase
      .from('tours')
      .update({ image_url: image.public_url, image_public_id: image.storage_path, image_alt: next.imageAlt || next.title, updated_at: new Date().toISOString() })
      .eq('id', editing.id);
    if (error) throw new Error(error.message);
    await loadTours();
  }

  async function onGalleryImageSaved(image: StorageImage) {
    if (!editing) return;
    const shouldBePrimary = editing.images.length === 0 && !editing.imageUrl;
    const { data, error } = await supabase
      .from('tour_images')
      .insert({
        tour_id: editing.id,
        image_url: image.public_url,
        storage_path: image.storage_path,
        alt_text: editing.imageAlt || editing.title,
        is_primary: shouldBePrimary,
        sort_order: editing.images.length + 1,
        active: true,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const nextImages = [...editing.images, data];
    markEditing({ ...editing, images: nextImages, imageUrl: shouldBePrimary ? data.image_url : editing.imageUrl, imagePublicId: shouldBePrimary ? data.storage_path : editing.imagePublicId });
    if (shouldBePrimary) {
      await supabase.from('tours').update({ image_url: data.image_url, image_public_id: data.storage_path, image_alt: data.alt_text }).eq('id', editing.id);
    }
    await loadTours();
  }

  async function setPrimaryImage(image: TourImageRow) {
    if (!editing) return;
    await supabase.from('tour_images').update({ is_primary: false }).eq('tour_id', editing.id);
    const { error } = await supabase.from('tour_images').update({ is_primary: true }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }
    const { error: tourError } = await supabase
      .from('tours')
      .update({ image_url: image.image_url, image_public_id: image.storage_path, image_alt: image.alt_text || editing.title })
      .eq('id', editing.id);
    if (tourError) {
      setError(tourError.message);
      return;
    }
    markEditing({
      ...editing,
      imageUrl: image.image_url,
      imagePublicId: image.storage_path,
      imageAlt: image.alt_text || editing.title,
      images: editing.images.map((item) => ({ ...item, is_primary: item.id === image.id })),
    });
    await loadTours();
  }

  async function confirmDeleteImage(image: TourImageRow) {
    if (!editing) return;
    const { error } = await supabase.from('tour_images').update({ active: false, pending_deletion: Boolean(image.storage_path) }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }
    if (image.storage_path) {
      try {
        await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'tour_images', resourceId: image.id });
      } catch {
        await supabase.from('tour_images').update({ deletion_error: 'Storage delete failed' }).eq('id', image.id);
      }
    }
    const remaining = editing.images.filter((item) => item.id !== image.id);
    markEditing({ ...editing, images: remaining });
    setDeleteImage(null);
    await loadTours();
  }

  function addActivity() {
    if (!editing || !activityInput.trim()) return;
    markEditing({ ...editing, activities: [...editing.activities, activityInput.trim()] });
    setActivityInput('');
  }

  function addInclusion() {
    if (!editing || !inclusionInput.trim()) return;
    markEditing({
      ...editing,
      inclusions: [
        ...editing.inclusions,
        { id: crypto.randomUUID(), label: inclusionInput.trim(), packageId: null, sortOrder: editing.inclusions.length + 1, active: true, isNew: true },
      ],
    });
    setInclusionInput('');
  }

  function addPackage() {
    if (!editing) return;
    const lastBoatId = editing.packages[editing.packages.length - 1]?.boatId || boats[0]?.id || '';
    markEditing({
      ...editing,
      packages: [
        ...editing.packages,
        {
          id: `package-${crypto.randomUUID().slice(0, 8)}`,
          boatTourId: null,
          boatId: lastBoatId,
          name: 'Half Day',
          packageType: 'half-day',
          durationValue: 4,
          durationUnit: 'hours',
          basePrice: 650,
          includedGuests: 5,
          maxGuests: 10,
          extraGuestPrice: 65,
          customQuote: false,
          description: '',
          imageUrl: null,
          imagePublicId: null,
          sortOrder: editing.packages.length + 1,
          active: true,
          isNew: true,
        },
      ],
    });
  }

  function moveArrayItem<T>(items: T[], index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  }

  const visibleTours = tours.filter((tour) => {
    const text = `${tour.title} ${tour.slug} ${tour.category} ${tour.location ?? ''}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  });

  const packagesForCurrentTour = useMemo(() => editing?.packages.filter((pkg) => !pkg.pendingDelete).sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [editing]);

  return (
    <div className="admin-page">
      <AdminPageHeader title="Tours" description="Crea experiencias, actividades, precios por duracion y barcos disponibles." actions={<button className="admin-btn" type="button" onClick={() => void createTour()}><Plus size={16} /> Crear tour</button>} />
      <AdminToolbar>
        <input className="admin-input" placeholder="Buscar tour por nombre, slug o categoria" value={search} onChange={(event) => setSearch(event.target.value)} />
      </AdminToolbar>

      {error ? <div className="admin-alert admin-alert--danger">{needsEditorNotice(error) ? 'No se pudo acceder a tours: se requiere una sesion de admin/editor en Supabase.' : error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando tours...</p>
      ) : (
        <AdminTable headers={['Tour', 'Categoria', 'Punto de salida', 'Publicacion', 'Destacado', 'Orden', 'Acciones']}>
          {visibleTours.map((tour) => (
            <tr key={tour.id}>
              <td>{tour.title}<div className="admin-muted">{tour.slug}</div></td>
              <td>{tour.category}</td>
              <td>{tour.location ?? '-'}</td>
              <td><AdminBadge value={toPublicationStatus(tour)} /></td>
              <td><AdminBadge value={tour.featured ? 'destacado' : 'normal'} /></td>
              <td>{tour.sort_order}</td>
              <td><button className="admin-btn admin-btn--ghost" type="button" onClick={() => openEditor(tour)}><Pencil size={14} /> Editar</button></td>
            </tr>
          ))}
          {visibleTours.length === 0 ? <tr><td colSpan={7} className="admin-muted">No hay tours para esta busqueda.</td></tr> : null}
        </AdminTable>
      )}

      <Modal open={Boolean(editing)} onClose={requestClose} titleId="tour-edit-title" className="admin-tour-modal">
        {editing ? (
          <form
            className="admin-modal-shell"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEditor(editing.publicationStatus);
            }}
          >
            <header className="admin-modal-header admin-tour-modal__header">
              <div>
                <h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> {editing.title || 'Nuevo tour'}</h2>
                <p className="admin-muted">Paso: {tabs.find((tab) => tab.id === activeTab)?.label}</p>
              </div>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar editor de tour" disabled={saving} onClick={requestClose}><X size={18} /></button>
            </header>

            <nav className="admin-tabs admin-tour-tabs" aria-label="Secciones del formulario de tour">
              {tabs.map((tab) => (
                <button key={tab.id} className={`admin-tab${activeTab === tab.id ? ' admin-tab--active' : ''}`} type="button" onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="admin-modal-body">
              {error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
              {notice ? <div className="admin-alert admin-alert--success" role="status">{notice}</div> : null}

              {activeTab === 'info' ? (
                <FormSection title="Informacion principal" description="Datos que los clientes veran primero en la pagina publica." icon={<Info size={16} />}>
                  <div className="admin-form-columns">
                    <label className="admin-field">
                      <span className="admin-field__label">Nombre del tour</span>
                      <input className="admin-input" aria-invalid={fieldErrors.title ? true : undefined} value={editing.title} onChange={(event) => markEditing({ ...editing, title: event.target.value, slug: editing.slug ? editing.slug : slugify(event.target.value) })} />
                      <span className="admin-field-help">Este nombre sera visible para los clientes en la pagina publica.</span>
                      {fieldErrors.title ? <span className="admin-field-error">{fieldErrors.title}</span> : null}
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Categoria</span>
                      <select className="admin-select" value={editing.category} onChange={(event) => markEditing({ ...editing, category: event.target.value })}>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <span className="admin-field-help">Agrupa el tour para filtros y tarjetas publicas.</span>
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Punto de salida</span>
                      {destinations.length > 0 ? (
                        <select className="admin-select" value={editing.location} onChange={(event) => markEditing({ ...editing, location: event.target.value })}>
                          <option value="">Selecciona un punto de salida</option>
                          {destinations.map((destination) => <option key={destination.id} value={destination.name}>{destination.name}</option>)}
                        </select>
                      ) : (
                        <input className="admin-input" value={editing.location} onChange={(event) => markEditing({ ...editing, location: event.target.value })} />
                      )}
                      <span className="admin-field-help">Usa una ubicacion registrada cuando exista para mantener consistencia.</span>
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Estado de publicacion</span>
                      <select className="admin-select" value={editing.publicationStatus} onChange={(event) => markEditing({ ...editing, publicationStatus: event.target.value as PublicationStatus })}>
                        <option value="draft">Borrador</option>
                        <option value="published">Publicado</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                      <span className="admin-field-help">Solo los tours publicados aparecen en el sitio y aceptan reservas.</span>
                    </label>
                  </div>
                  <label className="admin-field">
                    <span className="admin-field__label">Descripcion corta</span>
                    <textarea className="admin-input" rows={3} aria-invalid={fieldErrors.description ? true : undefined} value={editing.description} onChange={(event) => markEditing({ ...editing, description: event.target.value })} />
                    <span className="admin-field-help">Resumen breve para tarjetas y modal publico.</span>
                    {fieldErrors.description ? <span className="admin-field-error">{fieldErrors.description}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Descripcion completa</span>
                    <textarea className="admin-input admin-textarea-list" value={editing.longDescription} onChange={(event) => markEditing({ ...editing, longDescription: event.target.value })} />
                    <span className="admin-field-help">Explica la experiencia con mas detalle. Puedes dejarla vacia si la descripcion corta es suficiente.</span>
                  </label>
                  <ToggleSwitch checked={editing.featured} onChange={(featured) => markEditing({ ...editing, featured })} label="Tour destacado" description="Marca este tour para resaltarlo en listados administrativos y futuras secciones destacadas." disabled={saving} />
                </FormSection>
              ) : null}

              {activeTab === 'experience' ? (
                <>
                  <FormSection title="Imagen principal del tour" description="Formatos permitidos: JPG, PNG o WebP. Peso maximo: 10 MB antes de comprimir. Resolucion recomendada: 1200 x 800 px." icon={<ImageIcon size={16} />}>
                    <AdminImageManager
                      resourceTable="tours"
                      resourceId={editing.id}
                      folder="tours"
                      currentImageUrl={editing.imageUrl}
                      currentStoragePath={editing.imagePublicId}
                      label={editing.imageAlt || editing.title}
                      aspect={3 / 2}
                      previewAspect={3 / 2}
                      maxWidth={1200}
                      maxHeight={800}
                      maxSizeMB={0.35}
                      onImageSaved={onMainImageSaved}
                    />
                    <label className="admin-field">
                      <span className="admin-field__label">Texto alternativo de la imagen</span>
                      <input className="admin-input" value={editing.imageAlt} onChange={(event) => markEditing({ ...editing, imageAlt: event.target.value })} />
                      <span className="admin-field-help">Describe la imagen para accesibilidad y buscadores.</span>
                    </label>
                  </FormSection>

                  <FormSection title="Galeria adicional" description="Agrega imagenes de apoyo y elige cual sera la portada del tour." icon={<ImagePlus size={16} />}>
                    <div className="admin-tour-gallery">
                      {editing.images.map((image) => (
                        <article className="admin-tour-gallery__item" key={image.id}>
                          <img src={image.image_url} alt={image.alt_text || editing.title} loading="lazy" decoding="async" />
                          <div>
                            <input className="admin-input" value={image.alt_text} aria-label="Texto alternativo" onChange={(event) => markEditing({ ...editing, images: editing.images.map((item) => item.id === image.id ? { ...item, alt_text: event.target.value } : item) })} />
                            <div className="admin-actions mt-2">
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void setPrimaryImage(image)}><Check size={14} /> Portada</button>
                              <button className="admin-btn admin-btn--danger" type="button" onClick={() => setDeleteImage(image)}><Trash2 size={14} /> Eliminar</button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {editing.images.length === 0 ? <p className="admin-muted">Este tour aun no tiene galeria adicional.</p> : null}
                    </div>
                    <AdminImageManager resourceTable="tours" resourceId={editing.id} folder="tours" label={`${editing.title} galeria`} aspect={3 / 2} maxWidth={1200} maxHeight={800} maxSizeMB={0.35} onImageSaved={onGalleryImageSaved} />
                  </FormSection>

                  <FormSection title="Actividades del tour" description="Agrega actividades como etiquetas individuales. Puedes reordenarlas o eliminarlas." icon={<Sparkles size={16} />}>
                    <div className="admin-inline-editor">
                      <input className="admin-input" value={activityInput} placeholder="Ej. Snorkeling" onChange={(event) => setActivityInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addActivity(); } }} />
                      <button className="admin-btn" type="button" onClick={addActivity}><Plus size={14} /> Agregar actividad</button>
                    </div>
                    <div className="admin-token-list">
                      {editing.activities.map((activity, index) => (
                        <span className="admin-token" key={`${activity}-${index}`}>
                          {activity}
                          <button type="button" aria-label="Subir actividad" onClick={() => markEditing({ ...editing, activities: moveArrayItem(editing.activities, index, -1) })}><ArrowUp size={13} /></button>
                          <button type="button" aria-label="Bajar actividad" onClick={() => markEditing({ ...editing, activities: moveArrayItem(editing.activities, index, 1) })}><ArrowDown size={13} /></button>
                          <button type="button" aria-label="Eliminar actividad" onClick={() => markEditing({ ...editing, activities: editing.activities.filter((_, itemIndex) => itemIndex !== index) })}><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                  </FormSection>

                  <FormSection title="Que incluye" description="Cada elemento se administra en una fila. Puede aplicar a todos los paquetes o a una duracion concreta." icon={<Check size={16} />}>
                    <div className="admin-inline-editor">
                      <input className="admin-input" value={inclusionInput} placeholder="Ej. Bebidas alcoholicas y no alcoholicas" onChange={(event) => setInclusionInput(event.target.value)} />
                      <button className="admin-btn" type="button" onClick={addInclusion}><Plus size={14} /> Agregar incluido</button>
                    </div>
                    <div className="admin-dynamic-list">
                      {editing.inclusions.filter((item) => !item.pendingDelete).map((item, index) => (
                        <div className="admin-dynamic-row" key={item.id}>
                          <input className="admin-input" value={item.label} onChange={(event) => markEditing({ ...editing, inclusions: editing.inclusions.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry) })} />
                          <select className="admin-select" value={item.packageId ?? ''} onChange={(event) => markEditing({ ...editing, inclusions: editing.inclusions.map((entry) => entry.id === item.id ? { ...entry, packageId: event.target.value || null } : entry) })}>
                            <option value="">Todos los paquetes</option>
                            {packagesForCurrentTour.map((pkg) => <option key={pkg.id} value={pkg.id}>{packageLabel(pkg)}</option>)}
                          </select>
                          <button className="admin-icon-btn" type="button" aria-label="Subir incluido" onClick={() => markEditing({ ...editing, inclusions: moveArrayItem(editing.inclusions, index, -1).map((entry, sortOrder) => ({ ...entry, sortOrder })) })}><ArrowUp size={16} /></button>
                          <button className="admin-icon-btn" type="button" aria-label="Bajar incluido" onClick={() => markEditing({ ...editing, inclusions: moveArrayItem(editing.inclusions, index, 1).map((entry, sortOrder) => ({ ...entry, sortOrder })) })}><ArrowDown size={16} /></button>
                          <button className="admin-icon-btn" type="button" aria-label="Eliminar incluido" onClick={() => markEditing({ ...editing, inclusions: editing.inclusions.map((entry) => entry.id === item.id ? { ...entry, pendingDelete: true } : entry) })}><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </FormSection>
                </>
              ) : null}

              {activeTab === 'packages' ? (
                <FormSection title="Paquetes" description="Cada paquete es la unica fuente de precio, duracion, personas incluidas y capacidad para esa combinacion de tour y bote." icon={<Package size={16} />}>
                  <div className="admin-actions">
                    <button className="admin-btn" type="button" onClick={addPackage}><Plus size={16} /> Agregar paquete</button>
                  </div>
                  <div className="admin-package-list">
                    {packagesForCurrentTour.map((pkg, index) => {
                      const packageBoat = boats.find((boat) => boat.id === pkg.boatId);
                      const packageInclusions = editing.inclusions.filter((item) => !item.pendingDelete && item.active && (item.packageId === null || item.packageId === pkg.id));
                      return (
                        <article className="admin-package-editor" key={pkg.id}>
                          <header>
                            <strong>{pkg.name || 'Nuevo paquete'}{packageBoat ? ` — ${packageBoat.name}` : ''}</strong>
                            <div className="admin-actions">
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => markEditing({ ...editing, packages: [...editing.packages, { ...pkg, id: `package-${crypto.randomUUID().slice(0, 8)}`, name: `${pkg.name} copia`, sortOrder: editing.packages.length + 1, isNew: true, imageUrl: null, imagePublicId: null }] })}><Copy size={14} /> Duplicar</button>
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, active: !item.active } : item) })}>{pkg.active ? 'Desactivar' : 'Activar'}</button>
                              <button className="admin-btn admin-btn--danger" type="button" onClick={() => setDeletePackage(pkg)}><Trash2 size={14} /> Eliminar</button>
                            </div>
                          </header>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Identificacion</p>
                            <div className="admin-form-columns">
                              <label className="admin-field">
                                <span className="admin-field__label">Nombre visible</span>
                                <input className="admin-input" aria-invalid={fieldErrors[`package-${pkg.id}-name`] ? true : undefined} value={pkg.name} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, name: event.target.value } : item) })} />
                                {fieldErrors[`package-${pkg.id}-name`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-name`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Bote</span>
                                <select className="admin-select" aria-invalid={fieldErrors[`package-${pkg.id}-boat`] ? true : undefined} value={pkg.boatId} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, boatId: event.target.value } : item) })}>
                                  <option value="">Selecciona un bote</option>
                                  {boats.map((boat) => <option key={boat.id} value={boat.id}>{boat.name}</option>)}
                                </select>
                                {packageBoat ? <span className="admin-field-help">Capacidad fisica del bote: {packageBoat.max_guests} personas.</span> : null}
                                {fieldErrors[`package-${pkg.id}-boat`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-boat`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Codigo / modalidad</span>
                                <input className="admin-input" placeholder="Ej. half-day, full-day, deluxe" value={pkg.packageType} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, packageType: event.target.value } : item) })} />
                                <span className="admin-field-help">Identificador interno de la modalidad. Se genera solo desde el nombre si lo dejas vacio.</span>
                              </label>
                            </div>
                          </div>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Duracion</p>
                            <div className="admin-form-columns">
                              <label className="admin-field">
                                <span className="admin-field__label">Duracion</span>
                                <input className="admin-input" type="number" min={0.5} step={0.5} aria-invalid={fieldErrors[`package-${pkg.id}-duration`] ? true : undefined} value={pkg.durationValue} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, durationValue: Number(event.target.value) } : item) })} />
                                {fieldErrors[`package-${pkg.id}-duration`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-duration`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Unidad</span>
                                <select className="admin-select" value={pkg.durationUnit} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, durationUnit: event.target.value as 'hours' | 'days' } : item) })}>
                                  <option value="hours">Horas</option>
                                  <option value="days">Dias</option>
                                </select>
                              </label>
                            </div>
                            <p className="admin-package-editor__duration-preview">{pkg.durationValue} {pkg.durationUnit === 'days' ? 'dia(s)' : 'horas'} &rarr; {durationToMinutes(pkg.durationValue, pkg.durationUnit)} min</p>
                          </div>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Precio</p>
                            <div className="admin-form-columns">
                              <label className="admin-field">
                                <span className="admin-field__label">Precio base USD</span>
                                <input className="admin-input" type="number" min={0} aria-invalid={fieldErrors[`package-${pkg.id}-price`] ? true : undefined} value={pkg.basePrice} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, basePrice: Number(event.target.value) } : item) })} />
                                {fieldErrors[`package-${pkg.id}-price`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-price`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Personas incluidas en el precio</span>
                                <input className="admin-input" type="number" min={1} aria-invalid={fieldErrors[`package-${pkg.id}-included`] ? true : undefined} value={pkg.includedGuests} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, includedGuests: Number(event.target.value) } : item) })} />
                                <span className="admin-field-help">Cantidad de huespedes cubiertos por el precio base.</span>
                                {fieldErrors[`package-${pkg.id}-included`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-included`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Precio por persona adicional</span>
                                <input className="admin-input" type="number" min={0} aria-invalid={fieldErrors[`package-${pkg.id}-extra`] ? true : undefined} value={pkg.extraGuestPrice} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, extraGuestPrice: Number(event.target.value) } : item) })} />
                                <span className="admin-field-help">Monto que se agregara por cada huesped que supere la cantidad incluida.</span>
                                {fieldErrors[`package-${pkg.id}-extra`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-extra`]}</span> : null}
                              </label>
                              <label className="admin-field">
                                <span className="admin-field__label">Capacidad maxima</span>
                                <input className="admin-input" type="number" min={1} aria-invalid={fieldErrors[`package-${pkg.id}-max`] ? true : undefined} value={pkg.maxGuests} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, maxGuests: Number(event.target.value) } : item) })} />
                                <span className="admin-field-help">Numero maximo de huespedes permitidos para esta modalidad.</span>
                                {fieldErrors[`package-${pkg.id}-max`] ? <span className="admin-field-error">{fieldErrors[`package-${pkg.id}-max`]}</span> : null}
                              </label>
                            </div>
                            <label className="admin-field">
                              <span className="admin-field__label">Descripcion opcional</span>
                              <textarea className="admin-input" value={pkg.description} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, description: event.target.value } : item) })} />
                            </label>
                          </div>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Incluidos</p>
                            <div className="admin-package-editor__inclusions">
                              {packageInclusions.length > 0
                                ? packageInclusions.map((item) => <span key={item.id} className="admin-muted">&bull; {item.label}</span>)
                                : <span className="admin-muted">Este paquete aun no tiene incluidos.</span>}
                            </div>
                            <span className="admin-field-help">Se editan desde la pestana Experiencia: cada fila de "Que incluye" puede aplicar a todos los paquetes o a este en particular.</span>
                          </div>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Configuracion</p>
                            <div className="admin-form-columns">
                              <label className="admin-field">
                                <span className="admin-field__label">Orden de aparicion</span>
                                <input className="admin-input" type="number" value={pkg.sortOrder} onChange={(event) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, sortOrder: Number(event.target.value) } : item) })} />
                              </label>
                            </div>
                            <ToggleSwitch checked={pkg.customQuote} onChange={(checked) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, customQuote: checked } : item) })} label="Cotizar manualmente" description="El precio se maneja fuera del sistema; el cliente vera 'Cotizar' en vez de un precio automatico." disabled={saving} />
                            <ToggleSwitch checked={pkg.active} onChange={(checked) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, active: checked } : item) })} label="Paquete activo" description={pkg.active ? 'Visible y reservable en el sitio publico.' : 'Oculto del sitio publico y no acepta reservas.'} disabled={saving} />
                            <div className="admin-actions">
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => markEditing({ ...editing, packages: moveArrayItem(editing.packages, index, -1).map((item, sortOrder) => ({ ...item, sortOrder })) })}><ArrowUp size={14} /> Subir</button>
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => markEditing({ ...editing, packages: moveArrayItem(editing.packages, index, 1).map((item, sortOrder) => ({ ...item, sortOrder })) })}><ArrowDown size={14} /> Bajar</button>
                            </div>
                          </div>

                          <div className="admin-package-editor__section">
                            <p className="admin-package-editor__section-label">Multimedia</p>
                            {!pkg.isNew ? (
                              <AdminImageManager
                                resourceTable="tour_packages"
                                resourceId={pkg.id}
                                folder="tours"
                                currentImageUrl={pkg.imageUrl}
                                currentStoragePath={pkg.imagePublicId}
                                label={pkg.name}
                                aspect={3 / 2}
                                maxWidth={1200}
                                maxHeight={800}
                                maxSizeMB={0.35}
                                onImageSaved={(image) => markEditing({ ...editing, packages: editing.packages.map((item) => item.id === pkg.id ? { ...item, imageUrl: image.public_url, imagePublicId: image.storage_path } : item) })}
                              />
                            ) : (
                              <p className="admin-field-help">Guarda el paquete para poder subir una imagen propia.</p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {packagesForCurrentTour.length === 0 ? <p className="admin-muted">Este tour aun no tiene paquetes.</p> : null}
                  </div>
                </FormSection>
              ) : null}

              {activeTab === 'publishing' ? (
                <FormSection title="Configuracion avanzada" description="Campos internos para URL, orden y control de publicacion." icon={<Settings2 size={16} />}>
                  <div className="admin-form-columns">
                    <label className="admin-field">
                      <span className="admin-field__label">Slug</span>
                      <input className="admin-input" aria-invalid={fieldErrors.slug ? true : undefined} value={editing.slug} onChange={(event) => markEditing({ ...editing, slug: slugify(event.target.value) })} />
                      <span className="admin-field-help">Se genera desde el nombre, pero puedes ajustarlo. Solo letras, numeros y guiones.</span>
                      {fieldErrors.slug ? <span className="admin-field-error">{fieldErrors.slug}</span> : null}
                    </label>
                    <label className="admin-field">
                      <span className="admin-field__label">Orden de aparicion</span>
                      <input className="admin-input" type="number" value={editing.sortOrder} onChange={(event) => markEditing({ ...editing, sortOrder: Number(event.target.value) })} />
                    </label>
                  </div>
                  <div className="admin-form-columns">
                    <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => markEditing({ ...editing, slug: slugify(editing.title) })}>Generar slug desde nombre</button>
                  </div>
                  <p className="admin-field-help">ID interno: {editing.id}</p>
                </FormSection>
              ) : null}
            </div>

            <ModalFooter>
              <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={requestClose}>Cancelar</button>
              <button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={() => void saveEditor('draft')}>Guardar borrador</button>
              <button className="admin-btn" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Guardando...</> : <><Save size={15} /> {editing.publicationStatus === 'published' ? 'Guardar cambios' : 'Publicar tour'}</>}
              </button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(deletePackage)} onClose={() => setDeletePackage(null)} titleId="package-delete-title" className="max-w-md">
        {deletePackage && editing ? (
          <div className="admin-modal-card">
            <h2 id="package-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar duracion y precio</h2>
            <p className="admin-muted mt-2">Esta accion elimina "{deletePackage.name}". Si ya tiene reservas historicas, la base de datos puede impedir la eliminacion.</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" onClick={() => { markEditing({ ...editing, packages: editing.packages.map((pkg) => pkg.id === deletePackage.id ? { ...pkg, pendingDelete: true } : pkg) }); setDeletePackage(null); }}><Trash2 size={16} /> Eliminar</button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setDeletePackage(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(deleteImage)} onClose={() => setDeleteImage(null)} titleId="tour-image-delete-title" className="max-w-md">
        {deleteImage ? (
          <div className="admin-modal-card">
            <h2 id="tour-image-delete-title" className="admin-card__title"><Trash2 size={18} /> Eliminar imagen</h2>
            <p className="admin-muted mt-2">La imagen se quitara de la galeria del tour.</p>
            <div className="admin-image-manager__actions mt-5">
              <button className="admin-btn admin-btn--danger" type="button" onClick={() => void confirmDeleteImage(deleteImage)}><Trash2 size={16} /> Eliminar</button>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setDeleteImage(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
