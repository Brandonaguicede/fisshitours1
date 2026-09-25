import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Image as ImageIcon, Info, Loader2, Pencil, Plus, Save, Settings2, Star, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import AdminStepper, { type AdminStepperStep } from '../../components/admin/AdminStepper';
import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminReorderToolbar, AdminTable } from '../../components/admin/AdminPrimitives';
import BoatToursPackagesEditor from '../../components/admin/BoatToursPackagesEditor';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { cleanupReplacedImage, deleteStorageImage } from '../../services/imageService';
import { translateTextsToSpanish } from '../../services/translationService';
import { editableText, textColumns, textsToTranslate, type BilingualColumns } from '../../utils/bilingualContent';
import type { StorageImage } from '../../services/imageService';
import { friendlyDeleteError } from '../../utils/adminErrors';
import { money } from '../../utils/format';

interface BoatImageRow {
  id: string;
  boat_id: string;
  image_url: string;
  storage_path: string | null;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
  active: boolean;
  pending_deletion: boolean;
  /**
   * true only for synthetic rows computed client-side by fallbackBoatImages() from the
   * legacy boats.images/image_url columns — they do NOT exist in boat_images (their id
   * is a fake "legacy-<boatId>-<n>" string, not a real uuid). Read-only preview only:
   * never pass one of these to setPrimaryImage / moveImage / deleteBoatImage, which
   * write to boat_images by real id. Real rows never set this flag.
   */
  synthetic?: boolean;
}

// One row per equipment item (boat_equipment), replacing the old single
// comma-separated featured_spec text field — each item can be added/
// removed/reordered on its own, instead of editing one big blob of text.
// `id` is generated client-side (crypto.randomUUID()) even for a brand-new
// item, exactly like tour_inclusions' pattern, so the same id can be used
// directly in the upsert on save.
//
// The admin edits ONE text per item, in ENGLISH (`labelEn`, the source). The Spanish (`labelEs`) is stored,
// not edited: DeepL generates it (EN -> ES) when Siguiente / Guardar borrador / Guardar saves an item that is
// new or whose English changed, and it is kept as loaded otherwise. `savedEn` is the English as loaded (to
// know what changed) and `loadedEn` the raw label_en column (so an untouched legacy row is written back
// exactly as it was). `label` (legacy) follows the English text on save.
interface BoatEquipmentEditItem {
  id: string;
  label: string;
  labelEn: string;
  labelEs: string;
  savedEn?: string;
  loadedEn?: string;
  sortOrder: number;
  isNew?: boolean;
  pendingDelete?: boolean;
}

interface BoatRow {
  id: string;
  slug: string;
  name: string;
  images: string[];
  /** English badge text shown in the form (badge_en, else the legacy badge). */
  badge: string | null;
  /** That same text as loaded/saved, to translate the badge only when it changes. */
  badgeSaved?: string;
  length: string | null;
  engine: string | null;
  featured_spec: string | null;
  max_guests: number;
  image_url: string | null;
  image_public_id: string | null;
  active: boolean;
  sort_order: number;
  boat_images?: BoatImageRow[];
  equipment: BoatEquipmentEditItem[];
}

type BoatStep = 'info' | 'gallery' | 'tours' | 'config';

const boatSteps: Array<AdminStepperStep<BoatStep>> = [
  { id: 'info', label: 'Información' },
  { id: 'gallery', label: 'Galería' },
  { id: 'tours', label: 'Tours y paquetes' },
  { id: 'config', label: 'Configuración' },
];

const isValidActiveImageCount = (count: number) => count >= 3 && count <= 6;

function toEquipmentEditItem(item: { id: string; label: string; label_es: string | null; label_en: string | null; sort_order: number }): BoatEquipmentEditItem {
  const english = item.label_en || item.label;
  return { id: item.id, label: item.label, labelEn: english, labelEs: item.label_es ?? '', savedEn: english, loadedEn: item.label_en ?? '', sortOrder: item.sort_order };
}

// What "unsaved changes" means for the Información step (photos, tours and packages persist on
// their own, immediately): a comparable string of everything the form edits.
const boatFormSnapshot = (boat: BoatRow) => JSON.stringify([
  boat.name, boat.badge ?? '', boat.length ?? '', boat.engine ?? '', boat.max_guests,
  boat.equipment.map((item) => [item.id, item.labelEn, item.labelEs, item.sortOrder, Boolean(item.pendingDelete)]),
]);

type BoatFieldErrors = { name?: string; maxGuests?: string; images?: string };

// The existing boat rules, in one place: a name and a valid capacity are always required; publishing
// additionally needs 3-6 photos (and Second Wind keeps its 10-passenger ceiling).
function validateBoat(boat: BoatRow, mode: 'draft' | 'publish' | 'advance'): BoatFieldErrors {
  const errors: BoatFieldErrors = {};
  if (!boat.name.trim()) errors.name = 'El nombre del bote es obligatorio.';
  if (!Number.isFinite(boat.max_guests) || boat.max_guests < 1) errors.maxGuests = 'La capacidad debe ser al menos 1.';
  else if (mode === 'publish' && boat.id === 'segundo-viento' && boat.max_guests > 10) errors.maxGuests = 'Second Wind no puede superar 10 pasajeros.';
  if (mode === 'publish') {
    const activeImageCount = (boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat)).filter((image) => image.active).length;
    if (!isValidActiveImageCount(activeImageCount)) errors.images = 'Para publicar el bote necesitas entre 3 y 6 imagenes.';
  }
  return errors;
}

function needsEditorNotice(message: string) {
  return /permission denied|denied for table|must be logged in|jwt/i.test(message);
}

function publicStoragePath(value: string): string | null {
  if (value.includes('/site-images/')) return value.split('/site-images/')[1] ?? null;
  try {
    const path = decodeURIComponent(new URL(value).pathname.replace(/^\//, ''));
    return /^(boats|tours|gallery|destinations|reviews|general)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

// READ-ONLY preview for a boat that has zero rows in boat_images: computes the legacy
// set from boats.image_url / boats.images (the old jsonb column) so the admin still sees
// the boat's existing photos instead of a blank gallery. This performs NO writes and
// loadBoats()/refreshEditing() never store its output as editing.boat_images — it is
// display-only.
// The synthetic "legacy-<boatId>-<n>" id is not a real uuid; callers must check
// `.synthetic` and hide/disable edit actions for these rows (see editorImages below) —
// setPrimaryImage / moveImage / deleteBoatImage write to boat_images by real id and will
// fail (or worse, silently no-op) against a synthetic one.
function fallbackBoatImages(boat: BoatRow): BoatImageRow[] {
  const urls = Array.from(new Set([boat.image_url, ...(boat.images ?? [])].filter(Boolean))) as string[];
  return urls.map((url, index) => ({
    id: `legacy-${boat.id}-${index}`,
    boat_id: boat.id,
    image_url: url,
    storage_path: index === 0 ? boat.image_public_id : publicStoragePath(url),
    alt_text: `${boat.name} ${index + 1}`,
    is_primary: index === 0,
    sort_order: index,
    active: true,
    pending_deletion: false,
    synthetic: true,
  }));
}

// Same pattern as AdminToursPage.tsx: the slug is generated once from the
// name and never shown/edited directly — a client-typed slug can silently
// diverge from the name or collide with another row.
function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `bote-${Date.now()}`;
}

// boats.id is a plain `text primary key` (no DB default) — the admin used to
// type this by hand in an "ID interno" field. It's now generated from the
// name, the same way the slug is: never shown, never edited, and — since
// it's the real primary key boat_images/boat_tours reference — checked
// against every id already loaded so two boats can never collide.
function uniqueBoatId(name: string, existingIds: ReadonlySet<string>) {
  const base = slugify(name);
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

const BADGE_COLUMNS: BilingualColumns = { legacy: 'badge', en: 'badge_en', es: 'badge_es' };

// The badge is shown to the admin in English (badge_en, else the legacy badge).
function withEditableBadge<T extends BoatRow>(boat: T): T {
  const badge = editableText(boat as unknown as Record<string, unknown>, BADGE_COLUMNS);
  return { ...boat, badge: badge || null, badgeSaved: badge };
}

// An item needs a (new) Spanish copy when it is new or its English text differs from what was loaded.
const equipmentNeedsSpanish = (item: BoatEquipmentEditItem) => Boolean(item.labelEn.trim()) && (Boolean(item.isNew) || item.labelEn.trim() !== (item.savedEn ?? ''));

// Everything Información persists that has a Spanish copy — the badge and the new/changed equipment items — is
// translated in ONE request before anything is written. A DeepL failure throws (TranslationError), so nothing
// is saved, no blank or invented Spanish is stored and the previous Spanish is left untouched.
async function translateBoatContent(boat: BoatRow): Promise<Map<string, string>> {
  return translateTextsToSpanish([
    ...textsToTranslate(boat.badge ?? '', boat.badgeSaved ?? ''),
    ...boat.equipment.filter((item) => !item.pendingDelete && equipmentNeedsSpanish(item)).map((item) => item.labelEn.trim()),
  ]);
}

export default function AdminBoatsPage() {
  const db = supabase as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [boats, setBoats] = useState<BoatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<BoatRow | null>(null);
  const [gallerySlot, setGallerySlot] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoatImageRow | null>(null);
  const [pendingBoatDelete, setPendingBoatDelete] = useState<BoatRow | null>(null);
  const [boatStep, setBoatStep] = useState<BoatStep>('info');
  const [focusTourId, setFocusTourId] = useState<string | undefined>(undefined);
  const [focusPackageId, setFocusPackageId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  // Synchronous twin of `saving`: a double click can land before React re-renders the disabled
  // buttons, and the first save of a new boat must insert exactly once.
  const savingRef = useRef(false);
  // Form contents as last loaded/saved, to know whether closing with the X would lose anything.
  const baselineRef = useRef<string | null>(null);
  // Set when the admin hides the boat from Configuración: a later "Guardar" then saves the changes
  // without silently making the boat visible again.
  const keepHiddenRef = useRef(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [startingPrices, setStartingPrices] = useState<Record<string, number>>({});
  const [fieldErrors, setFieldErrors] = useState<BoatFieldErrors>({});
  const focusBoatName = () => window.requestAnimationFrame(() => document.getElementById('boat-name')?.focus());
  const [search, setSearch] = useState('');
  const [boatStatusFilter, setBoatStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [equipmentInput, setEquipmentInput] = useState('');

  async function loadBoats() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('boats')
      .select('id, slug, name, images, badge, badge_en, badge_es, length, engine, featured_spec, max_guests, image_url, image_public_id, active, sort_order')
      .order('sort_order', { ascending: true });

    if (error) {
      setLoading(false);
      setBoats([]);
      setError(error.message);
      return;
    }

    const rows = ((data ?? []) as unknown as BoatRow[]).map((boat) => withEditableBadge({ ...boat, images: Array.isArray(boat.images) ? boat.images : [] }));
    const boatIds = rows.map((boat) => boat.id);
    const imagesResult = boatIds.length
      ? await db
          .from('boat_images')
          .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
          .in('boat_id', boatIds)
          .eq('active', true)
          .order('sort_order', { ascending: true })
      : { data: [], error: null };
    const equipmentResult = boatIds.length
      ? await db
          .from('boat_equipment')
          .select('id, boat_id, label, label_es, label_en, sort_order, active')
          .in('boat_id', boatIds)
          .eq('active', true)
          .order('sort_order', { ascending: true })
      : { data: [], error: null };

    const imagesByBoat = new Map<string, BoatImageRow[]>();
    if (!imagesResult.error) {
      for (const image of imagesResult.data ?? []) {
        const current = imagesByBoat.get(image.boat_id) ?? [];
        current.push(image as BoatImageRow);
        imagesByBoat.set(image.boat_id, current);
      }
    }
    const equipmentByBoat = new Map<string, BoatEquipmentEditItem[]>();
    if (!equipmentResult.error) {
      for (const item of equipmentResult.data ?? []) {
        const current = equipmentByBoat.get(item.boat_id) ?? [];
        current.push(toEquipmentEditItem(item));
        equipmentByBoat.set(item.boat_id, current);
      }
    }

    // Read-only: boat_images rows as-is, or [] when a boat has none yet. NEVER
    // fallbackBoatImages() here — that would put synthetic, unpersisted rows into
    // editing.boat_images, which the write handlers (onGalleryImageSaved,
    // deleteBoatImage, setPrimaryImage, moveImage) trust as real. The synthetic
    // read-only preview is applied only at render time, in editorImages below.
    setBoats(rows.map((boat) => ({ ...boat, boat_images: imagesByBoat.get(boat.id) ?? [], equipment: equipmentByBoat.get(boat.id) ?? [] })));
    setLoading(false);
    await loadStartingPrices();
  }

  // "Desde $X" is computed live from tour_packages (the source of truth for pricing),
  // never stored on boats.
  async function loadStartingPrices() {
    const { data, error } = await supabase
      .from('tour_packages')
      .select('base_price, custom_quote, boat_tours(boat_id)')
      .eq('active', true);
    if (error || !data) return;
    const prices: Record<string, number> = {};
    for (const row of data as unknown as { base_price: number; custom_quote: boolean; boat_tours: { boat_id: string } | null }[]) {
      if (row.custom_quote || !row.boat_tours) continue;
      const boatId = row.boat_tours.boat_id;
      const price = Number(row.base_price);
      prices[boatId] = boatId in prices ? Math.min(prices[boatId], price) : price;
    }
    setStartingPrices(prices);
  }

  useEffect(() => {
    void loadBoats();
  }, []);

  // Deep link from Resumen de paquetes: /admin/boats?boatId=<id>[&tourId=<id>] opens the boat
  // on its "Tours y paquetes" step and, with tourId, scrolls to and highlights that tour.
  useEffect(() => {
    const requestedId = searchParams.get('boatId');
    if (!requestedId || !boats || editing) return;
    const target = boats.find((boat) => boat.id === requestedId);
    if (!target) return;
    const requestedTourId = searchParams.get('tourId') ?? undefined;
    openEditor(target);
    setBoatStep('tours');
    setFocusTourId(requestedTourId);
    setFocusPackageId(searchParams.get('packageId') ?? undefined);
    setSearchParams((current) => {
      current.delete('boatId');
      current.delete('tourId');
      current.delete('packageId');
      return current;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boats, searchParams]);

  // Fresh baseline whenever a different boat (or a just-created row) becomes the one being edited.
  useEffect(() => {
    baselineRef.current = editing ? boatFormSnapshot(editing) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function openEditor(boat: BoatRow) {
    keepHiddenRef.current = false;
    setEditing(boat);
    setBoatStep('info');
    setFocusTourId(undefined);
    setFocusPackageId(undefined);
    setGallerySlot(null);
    setFieldErrors({});
    setEquipmentInput('');
  }

  async function createBoat() {
    setNotice('');
    setError('');
    setFieldErrors({});
    setBoatStep('info');
    setFocusTourId(undefined);
    setFocusPackageId(undefined);
    keepHiddenRef.current = false;
    // Local state only: the row is created once, when the name is valid and the user moves on
    // (Siguiente) or saves a draft — never just by opening the form.
    const id = `nuevo-bote-${Date.now()}`;
    setEditing({
      id,
      slug: id,
      name: '',
      images: [],
      badge: '',
      badgeSaved: '',
      length: '',
      engine: '',
      featured_spec: '',
      max_guests: 10,
      image_url: null,
      image_public_id: null,
      active: false,
      // Placeholder: the real value is max(sort_order)+1, read fresh right before the insert.
      sort_order: 0,
      boat_images: [],
      equipment: [],
    });
    setEquipmentInput('');
  }

  async function closeEditor() {
    if (editing && baselineRef.current !== null && boatFormSnapshot(editing) !== baselineRef.current && !window.confirm('Hay cambios sin guardar. Si cierras ahora, se perderán.')) return;
    setEditing(null);
    setFocusTourId(undefined);
    setFocusPackageId(undefined);
    setGallerySlot(null);
    setPendingDelete(null);
    setPendingBoatDelete(null);
  }

  async function syncBoatImageFields(boatId: string, images: BoatImageRow[]) {
    const activeImages = images.filter((image) => image.active).sort((a, b) => a.sort_order - b.sort_order);
    const primary = activeImages.find((image) => image.is_primary) ?? activeImages[0] ?? null;
    const { error } = await supabase
      .from('boats')
      .update({
        image_url: primary?.image_url ?? null,
        image_public_id: primary?.storage_path ?? null,
        images: activeImages.filter((image) => image.id !== primary?.id).map((image) => image.image_url),
        updated_at: new Date().toISOString(),
      })
      .eq('id', boatId);
    if (error) throw new Error(error.message);
  }

  async function refreshEditing(boatId = editing?.id) {
    await loadBoats();
    if (!boatId) return;
    const { data } = await supabase
      .from('boats')
      .select('id, slug, name, images, badge, badge_en, badge_es, length, engine, featured_spec, max_guests, image_url, image_public_id, active, sort_order')
      .eq('id', boatId)
      .single();
    if (!data) return;
    const imagesResult = await db
      .from('boat_images')
      .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
      .eq('boat_id', boatId)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    const equipmentResult = await db
      .from('boat_equipment')
      .select('id, boat_id, label, label_es, label_en, sort_order, active')
      .eq('boat_id', boatId)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    const rawBoat = data as unknown as BoatRow;
    const boat = {
      ...withEditableBadge(rawBoat),
      images: Array.isArray(rawBoat.images) ? rawBoat.images.filter((item): item is string => typeof item === 'string') : [],
      boat_images: (imagesResult.data ?? []) as BoatImageRow[],
      equipment: ((equipmentResult.data ?? []) as Array<{ id: string; label: string; label_es: string | null; label_en: string | null; sort_order: number }>)
        .map(toEquipmentEditItem),
    };
    setEditing(boat);
    setEquipmentInput('');
  }

  // Visibility rules:
  //  - "Guardar" (last step) is the final save: it requires everything a public boat needs and
  //    makes the boat visible — unless the admin hid it from Configuración in this session, in
  //    which case it only saves the changes and the boat stays hidden.
  //  - "Guardar borrador" (any step) needs just the name and capacity, saves progress and NEVER
  //    changes visibility: a new boat is created hidden; a boat that is already visible stays so.
  //  - "advance" (Siguiente from Información) saves the info fields — creating the row the first
  //    time, exactly once — without touching visibility either.
  //  - "Mostrar/Ocultar bote" (Configuración) is the explicit switch: toggleBoatVisibility.
  async function saveEditor(requestedMode: 'draft' | 'publish' | 'advance'): Promise<boolean> {
    if (!editing || saving || savingRef.current) return false;
    const mode = requestedMode === 'publish' && keepHiddenRef.current ? 'draft' : requestedMode;
    const isExisting = Boolean(boats?.some((boat) => boat.id === editing.id));
    const name = editing.name.trim();
    const nextFieldErrors = validateBoat(editing, mode);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      // Name and capacity live in Información; photo problems belong to Galería.
      setBoatStep(nextFieldErrors.name || nextFieldErrors.maxGuests ? 'info' : 'gallery');
      if (nextFieldErrors.name) focusBoatName();
      if (mode === 'publish') setError('Revisa los campos marcados antes de publicar.');
      else if (mode === 'draft') setError('Revisa los campos marcados antes de guardar el borrador.');
      return false;
    }
    setSaving(true);
    savingRef.current = true;
    setError('');
    setNotice('');
    try {
      // Spanish for the new/changed badge and equipment (English is the source), before ANY write: if DeepL fails
      // nothing is saved and the form keeps the text for a retry.
      const spanishByText = await translateBoatContent(editing);
      // Generated once here, on creation, and never re-derived from the name
      // afterwards — an existing row's own id/slug are reused as-is on every
      // later save, so they can never silently drift or collide once live.
      const id = isExisting ? editing.id : uniqueBoatId(name, new Set((boats ?? []).map((boat) => boat.id)));
      const slug = isExisting ? editing.slug : slugify(name);
      const common = {
        slug,
        name,
        badge: editing.badge?.trim() || null,
        ...textColumns(editing.badge ?? '', editing.badgeSaved ?? '', BADGE_COLUMNS, spanishByText),
        length: editing.length?.trim() || null,
        engine: editing.engine?.trim() || null,
        // featured_spec is no longer written here — "Equipamiento" now lives
        // in boat_equipment, one row per item, edited below.
        max_guests: editing.max_guests,
        images: editing.images ?? [],
        image_url: editing.image_url,
        image_public_id: editing.image_public_id,
        updated_at: new Date().toISOString(),
      };
      // sort_order is only written on creation (fresh max+1, never boats.length, which collides
      // once a row has been deleted) and by Reordenar/deleteBoat renumbering — an edit must not
      // overwrite it with whatever value the editor happened to load.
      let nextSortOrder = 0;
      if (!isExisting) {
        const { data: highest, error: maxError } = await supabase.from('boats').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
        if (maxError) throw new Error(maxError.message);
        nextSortOrder = (highest?.sort_order ?? 0) + 1;
      }
      const { error: boatError } = isExisting
        ? await supabase.from('boats').update(mode === 'publish' ? { ...common, active: true } : common).eq('id', editing.id)
        : await supabase.from('boats').insert({ ...common, id, active: mode === 'publish', sort_order: nextSortOrder });
      if (boatError) throw new Error(boatError.message);

      for (const item of editing.equipment) {
        if (item.pendingDelete) {
          if (!item.isNew) await supabase.from('boat_equipment').delete().eq('id', item.id);
          continue;
        }
        const text = item.labelEn.trim();
        // `label` (legacy) follows the English text; a row needs some text to be worth saving.
        const label = text || item.label.trim();
        if (!label) continue;
        const changed = equipmentNeedsSpanish(item);
        const { error: equipmentError } = await supabase.from('boat_equipment').upsert({
          id: item.id,
          boat_id: id,
          label,
          label_en: changed ? text : item.loadedEn || null,
          label_es: (changed ? spanishByText.get(text) : item.labelEs.trim()) || null,
          sort_order: item.sortOrder,
          active: true,
          updated_at: new Date().toISOString(),
        });
        if (equipmentError) throw new Error(equipmentError.message);
      }

      if (mode === 'advance') {
        // Stay in the wizard with what we just saved: the real id/slug/sort_order of a boat that
        // was just created, and equipment rows that are now persisted (so removing one later
        // really deletes it). The list reload is what makes the new boat "existing".
        const saved: BoatRow = {
          ...editing,
          id,
          slug,
          sort_order: isExisting ? editing.sort_order : nextSortOrder,
          equipment: editing.equipment.filter((item) => !item.pendingDelete).map((item) => {
            if (!equipmentNeedsSpanish(item)) return { ...item, isNew: false };
            const text = item.labelEn.trim();
            return { ...item, isNew: false, savedEn: text, loadedEn: text, labelEs: spanishByText.get(text) ?? item.labelEs };
          }),
          badgeSaved: (editing.badge ?? '').trim(),
        };
        baselineRef.current = boatFormSnapshot(saved);
        setEditing((current) => (current ? { ...current, id, slug, sort_order: saved.sort_order, equipment: saved.equipment, badgeSaved: saved.badgeSaved } : current));
        await loadBoats();
      } else {
        setNotice(
          mode === 'publish'
            ? (editing.active ? 'Bote guardado.' : 'Bote publicado.')
            : editing.active ? 'Cambios guardados. El bote sigue visible.'
            : keepHiddenRef.current ? 'Cambios guardados. El bote sigue oculto.'
            : 'Borrador guardado.',
        );
        setEditing(null);
        setFocusTourId(undefined);
    setFocusPackageId(undefined);
        await loadBoats();
      }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el bote.');
      return false;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  // Configuración > Mostrar / Ocultar bote: an explicit, standalone switch (takes effect on click,
  // like the same control in Tours). Showing re-runs the publication rules; hiding never needs them.
  async function toggleBoatVisibility() {
    if (!editing || saving || savingRef.current || togglingVisibility) return;
    const nextActive = !editing.active;
    if (nextActive) {
      const errors = validateBoat(editing, 'publish');
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        setError('Completa los requisitos antes de mostrar el bote.');
        return;
      }
    }
    setTogglingVisibility(true);
    setError('');
    setNotice('');
    const { error: toggleError } = await supabase.from('boats').update({ active: nextActive, updated_at: new Date().toISOString() }).eq('id', editing.id);
    setTogglingVisibility(false);
    if (toggleError) {
      setError(toggleError.message);
      return;
    }
    keepHiddenRef.current = !nextActive;
    setEditing((current) => (current ? { ...current, active: nextActive } : current));
    setNotice(nextActive ? 'Bote activado.' : 'Bote oculto.');
    await loadBoats();
  }

  // Wizard navigation. Leaving Información forward saves it first — for a new boat that is
  // what creates the row (exactly once), which the Tours y paquetes step needs to exist.
  async function goBoatStep(direction: -1 | 1, target?: BoatStep) {
    if (!editing || saving || savingRef.current) return;
    const currentIndex = boatSteps.findIndex((item) => item.id === boatStep);
    const targetIndex = target ? boatSteps.findIndex((item) => item.id === target) : currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= boatSteps.length || targetIndex === currentIndex) return;
    if (targetIndex > currentIndex && boatStep === 'info' && !(await saveEditor('advance'))) return;
    setBoatStep(boatSteps[targetIndex].id);
  }

  // Quick-add: typed once, goes straight into the Español field (same "admin writes Spanish"
  // convention as the rest of this admin); the English field is filled in by hand below it.
  function addEquipmentItem() {
    if (!editing || !equipmentInput.trim()) return;
    const text = equipmentInput.trim();
    setEditing({
      ...editing,
      equipment: [...editing.equipment, { id: crypto.randomUUID(), label: text, labelEn: text, labelEs: '', sortOrder: editing.equipment.length + 1, isNew: true }],
    });
    setEquipmentInput('');
  }

  function updateEquipmentLabel(itemId: string, labelEn: string) {
    if (!editing) return;
    setEditing({ ...editing, equipment: editing.equipment.map((item) => (item.id === itemId ? { ...item, labelEn } : item)) });
  }

  function removeEquipmentItem(itemId: string) {
    if (!editing) return;
    setEditing({ ...editing, equipment: editing.equipment.map((item) => (item.id === itemId ? { ...item, pendingDelete: true } : item)) });
  }

  // Swaps sort_order with the neighboring visible item — simple, and
  // consistent with how tour_inclusions/activities order themselves in
  // this admin (no drag-and-drop elsewhere in these list fields either).
  function moveEquipmentItem(itemId: string, direction: -1 | 1) {
    if (!editing) return;
    const visible = editing.equipment.filter((item) => !item.pendingDelete).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = visible.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= visible.length) return;
    const current = visible[index];
    const target = visible[targetIndex];
    setEditing({
      ...editing,
      equipment: editing.equipment.map((item) => {
        if (item.id === current.id) return { ...item, sortOrder: target.sortOrder };
        if (item.id === target.id) return { ...item, sortOrder: current.sortOrder };
        return item;
      }),
    });
  }

  async function deleteBoat(boat: BoatRow) {
    setSaving(true);
    setError('');
    setNotice('');
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    const { error } = await supabase.from('boats').delete().eq('id', boat.id);
    if (error) {
      setSaving(false);
      setPendingBoatDelete(null);
      setError(friendlyDeleteError(error, 'este bote'));
      return;
    }
    // Close the hole the deleted boat leaves in sort_order so numbering stays 1..N on its own
    // (only rows whose number actually changes are written).
    const remaining = (boats ?? []).filter((item) => item.id !== boat.id).sort((a, b) => a.sort_order - b.sort_order);
    let renumberError = '';
    for (const [index, item] of remaining.entries()) {
      if (item.sort_order === index + 1) continue;
      const { error: orderError } = await supabase.from('boats').update({ sort_order: index + 1 }).eq('id', item.id);
      if (orderError) { renumberError = orderError.message; break; }
    }
    for (const image of images) {
      if (!image.storage_path) continue;
      try {
        await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'boat_images', resourceId: image.id });
      } catch {
        // The database row is already gone; storage cleanup can be retried separately if needed.
      }
    }
    setSaving(false);
    setPendingBoatDelete(null);
    setEditing(null);
    if (renumberError) setError(`Bote eliminado, pero no se pudo renumerar el orden: ${renumberError}. Usa Reordenar > Guardar orden.`);
    else setNotice('Bote eliminado.');
    await loadBoats();
  }

  async function onGalleryImageSaved(image: StorageImage) {
    if (!editing) return;
    const currentImages = editing.boat_images ?? [];
    if (currentImages.length >= 6) throw new Error('El bote ya alcanzo el maximo de 6 imagenes.');
    const nextImageCount = currentImages.length + 1;
    const deactivatedForImageCount = editing.active && !isValidActiveImageCount(nextImageCount);
    if (deactivatedForImageCount) {
      const { error: deactivateError } = await supabase.from('boats').update({ active: false, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (deactivateError) throw new Error(deactivateError.message);
    }
    const shouldBePrimary = currentImages.length === 0;
    // Use max(sort_order) + 1, not currentImages.length: after a delete, remaining
    // sort_order values have a gap (e.g. [0, 2] once index 1 was removed), so
    // currentImages.length (2) would collide with the still-existing sort_order=2 row
    // instead of appending after it. That collision made a newly-added "replacement"
    // image tie for position with an existing one instead of landing where expected.
    const nextSortOrder = currentImages.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
    const { data, error } = await db
      .from('boat_images')
      .insert({
        boat_id: editing.id,
        image_url: image.public_url,
        storage_path: image.storage_path,
        alt_text: `${editing.name} image`,
        is_primary: shouldBePrimary,
        sort_order: nextSortOrder,
        active: true,
      })
      .select('id, boat_id, image_url, storage_path, alt_text, is_primary, sort_order, active, pending_deletion')
      .single();
    if (error) throw new Error(error.message);
    const nextImages = shouldBePrimary ? [data as BoatImageRow] : [...currentImages, data as BoatImageRow];
    await syncBoatImageFields(editing.id, nextImages);
    if (deactivatedForImageCount) {
      setNotice(`Imagen agregada. El bote se inactivo temporalmente porque ahora tiene ${nextImages.length} imagenes; necesitas entre 3 y 6 para activarlo.`);
    }
    await refreshEditing(editing.id);
  }

  // "Cambiar" on a slot: the new upload takes the place of that photo (same row, same position and
  // cover flag), exactly like changing a photo in the Tours gallery.
  // Order matters: the new file is already uploaded (AdminImageManager); the row and every copy of
  // its reference (boats.image_url / images) are updated FIRST, and only then is the previous file
  // deleted. If the upload or either update fails, the old photo is untouched (and the manager
  // discards the new upload); if only the delete fails, the old file is kept and reported.
  async function replaceBoatImage(image: StorageImage, current: BoatImageRow) {
    if (!editing) return;
    const { error } = await db
      .from('boat_images')
      .update({ image_url: image.public_url, storage_path: image.storage_path, alt_text: `${editing.name} image` })
      .eq('id', current.id);
    if (error) throw new Error(error.message);
    await syncBoatImageFields(editing.id, (editing.boat_images ?? []).map((item) => (item.id === current.id ? { ...item, image_url: image.public_url, storage_path: image.storage_path } : item)));
    const cleanup = await cleanupReplacedImage(current.storage_path, image.storage_path, 'boat_images', current.id);
    await refreshEditing(editing.id);
    // After the refresh: loading the list clears `error`, which would wipe this warning.
    if (cleanup === 'pending') setError('Foto cambiada. La foto anterior no se pudo borrar del almacenamiento y quedó pendiente de limpieza.');
  }

  async function setPrimaryImage(image: BoatImageRow) {
    if (!editing) return;
    setError('');
    const currentImages = editing.boat_images ?? [];
    await db.from('boat_images').update({ is_primary: false }).eq('boat_id', editing.id);
    const { error } = await db.from('boat_images').update({ is_primary: true, active: true }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }
    await syncBoatImageFields(editing.id, currentImages.map((item) => ({ ...item, is_primary: item.id === image.id })));
    await refreshEditing(editing.id);
  }

  async function moveImage(image: BoatImageRow, direction: -1 | 1) {
    if (!editing) return;
    const images = [...(editing.boat_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const index = images.findIndex((item) => item.id === image.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    const updates = images.map((item, sort_order) => db.from('boat_images').update({ sort_order }).eq('id', item.id));
    const results = await Promise.all(updates);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    await syncBoatImageFields(editing.id, images.map((item, sort_order) => ({ ...item, sort_order })));
    await refreshEditing(editing.id);
  }

  async function deleteBoatImage(image: BoatImageRow) {
    if (!editing) return;
    const currentImages = editing.boat_images ?? [];
    const remaining = currentImages.filter((item) => item.id !== image.id);
    if (editing.active && !isValidActiveImageCount(remaining.length)) {
      setPendingDelete(null);
      setError(`No puedes eliminar esta imagen mientras el bote esta activo: quedaria con ${remaining.length}. Inactivalo primero.`);
      return;
    }
    if (image.is_primary && remaining.length > 0) {
      const replacement = remaining[0];
      await db.from('boat_images').update({ is_primary: true }).eq('id', replacement.id);
      replacement.is_primary = true;
    }

    const { error } = await db.from('boat_images').update({ active: false, pending_deletion: Boolean(image.storage_path) }).eq('id', image.id);
    if (error) {
      setError(error.message);
      return;
    }

    if (image.storage_path) {
      try {
        await deleteStorageImage({ storagePath: image.storage_path, resourceTable: 'boat_images', resourceId: image.id });
        await db.from('boat_images').update({ pending_deletion: false }).eq('id', image.id);
      } catch {
        await db.from('boat_images').update({ pending_deletion: true, deletion_error: 'Storage delete failed' }).eq('id', image.id);
      }
    }

    await syncBoatImageFields(editing.id, remaining);
    setPendingDelete(null);
    setNotice('Imagen eliminada del bote.');
    await refreshEditing(editing.id);
  }

  // editing.boat_images is always real (or []) — see loadBoats()/refreshEditing(). The
  // synthetic legacy preview is applied ONLY here, for display, and every row it produces
  // carries `synthetic: true` so the actions below know not to wire real writes to it.
  const editorImages = useMemo(() => (editing?.boat_images?.length ? editing.boat_images : editing ? fallbackBoatImages(editing) : []), [editing]);
  const isExistingBoat = Boolean(editing && boats?.some((boat) => boat.id === editing.id));
  // True while we're showing the boat's legacy boats.images/image_url as a read-only
  // preview because it has no boat_images rows yet.
  const isLegacyPreview = Boolean(editing && !editing.boat_images?.length && editorImages.length > 0);
  const visibleEquipment = editing ? editing.equipment.filter((item) => !item.pendingDelete).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  // What still blocks publishing, from the same rules saveEditor('publish') enforces.
  const publishErrors = editing ? validateBoat(editing, 'publish') : {};
  const publishMissing = [publishErrors.name && 'Nombre del bote', publishErrors.maxGuests && 'Capacidad máxima', publishErrors.images && 'Al menos 3 fotos'].filter(Boolean) as string[];
  const visibleBoats = (boats ?? [])
    .filter((boat) => boatStatusFilter === 'all' || (boatStatusFilter === 'active') === boat.active)
    .filter((boat) => boat.name.toLowerCase().includes(search.toLowerCase()));
  const reorder = useAdminReorder<BoatRow>(boats ?? []);
  const canReorder = search.trim() === '' && boatStatusFilter === 'all';

  async function persistBoatOrder(updates: Array<{ id: string; sort_order: number }>) {
    for (const update of updates) {
      const { error } = await supabase.from('boats').update({ sort_order: update.sort_order }).eq('id', update.id);
      if (error) { setError(error.message); throw new Error(error.message); }
    }
    setNotice('Orden actualizado.');
    await loadBoats();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Botes" description="Flota disponible para paquetes reservables." />
      <AdminModuleSurface>
        <AdminListToolbar
          embedded
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar bote por nombre"
          filters={
            <AdminFilterMenu panelLabel="Filtros de botes" panelDescription="Refina la lista de botes." activeCount={Number(boatStatusFilter !== 'all')} onReset={() => setBoatStatusFilter('all')}>
              <label className="admin-field">
                <span className="admin-field__label">Estado</span>
                <select className="admin-select" value={boatStatusFilter} onChange={(event) => setBoatStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}>
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </label>
            </AdminFilterMenu>
          }
          primaryAction={<button className="admin-btn" type="button" disabled={reorder.reordering} onClick={() => void createBoat()}><Plus size={16} /> Crear bote</button>}
          secondaryActions={
            <AdminReorderToolbar
              reordering={reorder.reordering}
              saving={reorder.saving}
              onStart={() => reorder.start()}
              onCancel={reorder.cancel}
              onSave={() => void reorder.save(persistBoatOrder)}
              disabledReason={canReorder ? undefined : 'Limpia la búsqueda y el filtro de estado para reordenar.'}
            />
          }
        />

      {error ? (
        <div className="admin-alert admin-alert--danger">
          {needsEditorNotice(error)
            ? 'No se pudo acceder a la flota: se requiere una sesion de admin/editor en Supabase.'
            : error}
        </div>
      ) : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      {loading ? (
        <p className="admin-muted">Cargando botes...</p>
      ) : (
        <AdminTable embedded headers={['Bote', 'Capacidad fisica', 'Motor', 'Desde', 'Orden', 'Estado', 'Acciones']}>
          {(reorder.reordering ? reorder.order : visibleBoats).map((boat, index) => (
            <tr
              key={boat.id}
              className={reorder.reordering ? `admin-sortable-row${reorder.dragId === boat.id ? ' admin-sortable-row--dragging' : ''}` : undefined}
              {...(reorder.reordering ? reorder.dragHandlers(boat.id) : {})}
            >
              <td>{boat.name}<div className="admin-muted">{boat.length ?? '-'}</div></td>
              <td>{boat.max_guests} max</td>
              <td>{boat.engine ?? '-'}</td>
              <td>{boat.id in startingPrices ? money(startingPrices[boat.id]) : '-'}</td>
              <td>
                {reorder.reordering ? (
                  <AdminReorderHandle
                    position={index + 1}
                    total={reorder.order.length}
                    dragging={reorder.dragId === boat.id}
                    onMoveUp={() => reorder.moveBy(boat.id, -1)}
                    onMoveDown={() => reorder.moveBy(boat.id, 1)}
                  />
                ) : boat.sort_order}
              </td>
              <td><AdminBadge value={boat.active} /></td>
              <td>
                <div className="admin-row-actions">
                  <button className="admin-icon-action" type="button" disabled={reorder.reordering} title="Editar bote" aria-label={`Editar bote ${boat.name}`} onClick={() => openEditor(boat)}><Pencil size={17} /></button>
                </div>
              </td>
            </tr>
          ))}
          {visibleBoats.length === 0 ? (
            <tr>
              <td colSpan={7} className="admin-muted">No hay botes para esta busqueda.</td>
            </tr>
          ) : null}
        </AdminTable>
      )}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={() => void closeEditor()} titleId="boat-edit-title" className="admin-boat-modal">
        {editing ? (
          <form
            className="admin-modal-shell"
            onSubmit={(event) => {
              event.preventDefault();
              // Enter moves forward; only the last step publishes.
              if (boatStep === 'config') void saveEditor('publish');
              else void goBoatStep(1);
            }}
          >
            <header className="admin-modal-header">
              <div>
                <h2 id="boat-edit-title" className="admin-card__title"><Pencil size={18} /> {isExistingBoat ? 'Editar bote' : 'Crear bote'}</h2>
                <p className="admin-muted">{boatSteps.findIndex((item) => item.id === boatStep) + 1} de {boatSteps.length} · {boatSteps.find((item) => item.id === boatStep)?.label}</p>
              </div>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" disabled={saving} onClick={() => void closeEditor()}><X size={18} /></button>
            </header>
            <AdminStepper label="Progreso del bote" steps={boatSteps} current={boatStep} onSelect={(next) => void goBoatStep(1, next)} />

            <div className="admin-modal-body admin-boat-step-body">
              {error ? (
                <div className="admin-alert admin-alert--danger" role="alert">
                  {needsEditorNotice(error)
                    ? 'No se pudo guardar: se requiere una sesion de admin/editor en Supabase.'
                    : error}
                </div>
              ) : null}

              {boatStep === 'info' ? (
                <>
                  <div className="admin-form-columns admin-boat-info-grid">
                    <FormSection title="Información general" description="Cómo se identifica el bote." icon={<Info size={16} />}>
                      <label className="admin-field">
                        <span className="admin-field__label">Nombre</span>
                        <input id="boat-name" name="name" className="admin-input" aria-required="true" aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={fieldErrors.name ? 'boat-name-error' : undefined} placeholder="Ej. Second Wind" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                        <span className="admin-field-help">Nombre propio: no se traduce.</span>
                        {fieldErrors.name ? <span id="boat-name-error" className="admin-field-error" role="alert">{fieldErrors.name}</span> : null}
                      </label>
                      <label className="admin-field">
                        <span className="admin-field__label">Etiqueta</span>
                        <input id="boat-badge" name="badge" className="admin-input" value={editing.badge ?? ''} onChange={(event) => setEditing({ ...editing, badge: event.target.value || null })} placeholder="e.g. Luxury meets nature" />
                        <span className="admin-field-help">En inglés: el español se genera al guardar.</span>
                      </label>
                    </FormSection>

                    <FormSection title="Capacidad y especificaciones" description="Datos físicos del bote." icon={<Users size={16} />}>
                      <label className="admin-field">
                        <span className="admin-field__label">Capacidad máxima</span>
                        <input
                          id="boat-max-guests"
                          name="max_guests"
                          className="admin-input"
                          type="number"
                          min={1}
                          max={editing.id === 'segundo-viento' ? 10 : undefined}
                          aria-invalid={fieldErrors.maxGuests ? true : undefined}
                          value={editing.max_guests}
                          onChange={(event) => setEditing({ ...editing, max_guests: Number(event.target.value) })}
                        />
                        <span className="admin-field-help">Ningún paquete puede superar este número de huéspedes.</span>
                        {fieldErrors.maxGuests ? <span className="admin-field-error">{fieldErrors.maxGuests}</span> : null}
                      </label>
                      <div className="admin-field-pair">
                        <label className="admin-field">
                          <span className="admin-field__label">Eslora</span>
                          <input id="boat-length" name="length" className="admin-input" value={editing.length ?? ''} onChange={(event) => setEditing({ ...editing, length: event.target.value || null })} placeholder="Ej. 32 pies" />
                        </label>
                        <label className="admin-field">
                          <span className="admin-field__label">Motor</span>
                          <input id="boat-engine" name="engine" className="admin-input" value={editing.engine ?? ''} onChange={(event) => setEditing({ ...editing, engine: event.target.value || null })} placeholder="Ej. 2x Yamaha 250HP" />
                        </label>
                      </div>
                    </FormSection>
                  </div>

                  <FormSection title="Equipamiento" description="Lo que ofrece el bote. Escríbelo en inglés: el español se genera al guardar." icon={<Settings2 size={16} />}>
                    <div className="admin-tour-list-field__add">
                      <input
                        id="boat-equipment-input"
                        className="admin-input"
                        aria-label="Nuevo equipamiento"
                        value={equipmentInput}
                        placeholder="Ej. Garmin GPS"
                        onChange={(event) => setEquipmentInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEquipmentItem(); } }}
                      />
                      <button className="admin-btn admin-btn--secondary" type="button" aria-label="Agregar equipamiento" disabled={!equipmentInput.trim()} onClick={addEquipmentItem}><Plus size={14} /> Agregar</button>
                    </div>
                    {visibleEquipment.length ? (
                      <>
                      <ul className="admin-equipment-list" aria-label="Lista de equipamiento">
                        {visibleEquipment.map((item, index) => (
                          <li className="admin-equipment-row" key={item.id}>
                            <label className="admin-field">
                              <span className="admin-visually-hidden">Equipamiento {index + 1}</span>
                              <input className="admin-input" value={item.labelEn} placeholder="e.g. Garmin GPS" onChange={(event) => updateEquipmentLabel(item.id, event.target.value)} aria-label={`Equipamiento ${index + 1}`} />
                            </label>
                            <div className="admin-equipment-row__actions">
                              <button type="button" className="admin-icon-action" aria-label={`Subir ${item.labelEn || item.label}`} title="Subir" disabled={index === 0} onClick={() => moveEquipmentItem(item.id, -1)}><ArrowUp size={15} /></button>
                              <button type="button" className="admin-icon-action" aria-label={`Bajar ${item.labelEn || item.label}`} title="Bajar" disabled={index === visibleEquipment.length - 1} onClick={() => moveEquipmentItem(item.id, 1)}><ArrowDown size={15} /></button>
                              <button type="button" className="admin-icon-action admin-icon-action--danger" aria-label={`Eliminar ${item.labelEn || item.label}`} title="Quitar" onClick={() => removeEquipmentItem(item.id)}><Trash2 size={15} /></button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      </>
                    ) : null}
                  </FormSection>
                </>
              ) : null}

              {boatStep === 'gallery' ? (
                <FormSection title="Galería" description="Mínimo 3 imágenes para publicar el bote." icon={<ImageIcon size={16} />}>
                  {fieldErrors.images ? <div className="admin-alert admin-alert--danger admin-gallery-error" role="alert">{fieldErrors.images}</div> : null}
                  {isLegacyPreview ? (
                    <p className="admin-field-help" role="status">
                      Estas fotos pertenecen al formato anterior y se muestran solo como referencia. Las nuevas imágenes del bote se administran desde esta galería.
                    </p>
                  ) : null}
                  <div className="admin-tour-image-slots">
                    {Array.from({ length: 6 }, (_, index) => {
                      const image = editorImages[index];
                      const selected = gallerySlot === index;
                      // New photos are appended, so only the first empty slot can be filled.
                      const canFill = index === editorImages.length;
                      return (
                        <article className={`admin-tour-image-slot${selected ? ' admin-tour-image-slot--editing' : ''}`} key={image?.id ?? index}>
                          <header><strong>Foto {index + 1}</strong>{image?.is_primary ? <AdminBadge value="Portada" /> : null}</header>
                          {selected ? (
                            <AdminImageManager
                              resourceTable="boats"
                              resourceId={editing.id}
                              folder="boats"
                              label={`${editing.name || 'Bote'} foto ${index + 1}`}
                              aspect={16 / 9}
                              maxWidth={1600}
                              maxHeight={900}
                              maxSizeMB={0.6}
                              retainPreviousOnUpload
                              {...(image && !image.synthetic ? { currentImageUrl: image.image_url, currentStoragePath: image.storage_path, requireReplacementToDelete: true } : {})}
                              onImageSaved={async (saved) => {
                                if (image && !image.synthetic) await replaceBoatImage(saved, image);
                                else await onGalleryImageSaved(saved);
                                setGallerySlot(null);
                              }}
                            />
                          ) : image ? (
                            <button className="admin-tour-image-slot__media" type="button" aria-label={`Cambiar foto ${index + 1}`} disabled={image.synthetic} onClick={() => setGallerySlot(index)}>
                              <img src={image.image_url} alt={image.alt_text || `${editing.name} foto ${index + 1}`} loading="lazy" decoding="async" />
                            </button>
                          ) : (
                            <button className="admin-tour-image-slot__empty" type="button" disabled={!canFill} onClick={() => setGallerySlot(index)}><Plus size={18} /> Seleccionar</button>
                          )}
                          <footer>
                            {selected ? (
                              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setGallerySlot(null)}>Cerrar</button>
                            ) : image ? (
                              image.synthetic ? null : (
                                <>
                                  <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setGallerySlot(index)}>Cambiar</button>
                                  <div className="admin-boat-slot-tools">
                                    {!image.is_primary ? <button className="admin-icon-btn" type="button" aria-label={`Marcar foto ${index + 1} como portada`} title="Marcar como portada" onClick={() => void setPrimaryImage(image)}><Star size={15} /></button> : null}
                                    <button className="admin-icon-btn" type="button" aria-label={`Mover foto ${index + 1} a la izquierda`} title="Mover a la izquierda" disabled={index === 0} onClick={() => void moveImage(image, -1)}><ChevronLeft size={15} /></button>
                                    <button className="admin-icon-btn" type="button" aria-label={`Mover foto ${index + 1} a la derecha`} title="Mover a la derecha" disabled={index === editorImages.length - 1} onClick={() => void moveImage(image, 1)}><ChevronRight size={15} /></button>
                                    <button className="admin-icon-btn" type="button" aria-label={`Eliminar foto ${index + 1}`} title="Eliminar" onClick={() => setPendingDelete(image)}><Trash2 size={15} /></button>
                                  </div>
                                </>
                              )
                            ) : (
                              <button className="admin-btn admin-btn--ghost" type="button" disabled={!canFill} onClick={() => setGallerySlot(index)}>Seleccionar</button>
                            )}
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                  <p className="admin-field-help" aria-live="polite">{editorImages.length} de 6 imágenes.</p>
                </FormSection>
              ) : null}

              {boatStep === 'tours' && isExistingBoat ? (
                <BoatToursPackagesEditor boatId={editing.id} boatName={editing.name} boatMaxGuests={editing.max_guests} focusTourId={focusTourId} focusPackageId={focusPackageId} />
              ) : null}

              {boatStep === 'config' ? (
                <FormSection title="Estado y visibilidad" description="Controla si este bote aparece en el sitio público." icon={<Settings2 size={16} />}>
                  <div className="admin-tour-config-row admin-tour-config-row--tour">
                    <div className="admin-tour-config-row__status">
                      <p className="admin-config-row__label">Estado actual</p>
                      {editing.active ? <AdminBadge value={true} label="Activo" /> : <AdminBadge value="Inactivo" />}
                      <p className="admin-muted">
                        {editing.active ? 'Visible en el sitio público y disponible para reservas.' : 'No aparece en el sitio público ni puede reservarse.'}
                      </p>
                      {!editing.active ? (
                        publishMissing.length ? (
                          <div className="admin-tour-missing">
                            <p className="admin-tour-missing__title">Requisitos pendientes</p>
                            <ul>{publishMissing.map((label) => <li key={label}>{label}</li>)}</ul>
                          </div>
                        ) : (
                          <p className="admin-tour-ready"><Check size={14} aria-hidden="true" /> Listo para publicar.</p>
                        )
                      ) : null}
                      <p className="admin-muted admin-config-position">Posición actual: {editing.sort_order}. Puedes cambiarla usando Reordenar en la lista de Botes.</p>
                    </div>
                    {/* The icon is the action that will happen: Mostrar -> Eye, Ocultar -> EyeOff. */}
                    <button
                      className={`admin-btn ${editing.active ? 'admin-btn--secondary' : ''}`}
                      type="button"
                      disabled={togglingVisibility}
                      onClick={() => void toggleBoatVisibility()}
                    >
                      {togglingVisibility ? <Loader2 className="animate-spin" size={15} /> : editing.active ? <EyeOff size={15} /> : <Eye size={15} />}
                      {editing.active ? 'Ocultar bote' : 'Mostrar bote'}
                    </button>
                  </div>
                  <div className="admin-tour-config-divider" role="separator" />
                  <div className="admin-tour-danger-row">
                    <div>
                      <strong>Eliminar bote</strong>
                      <p className="admin-muted">Esta acción elimina el bote y su información asociada. No se puede deshacer.</p>
                    </div>
                    <button className="admin-btn admin-btn--danger" type="button" onClick={() => setPendingBoatDelete(editing)}>
                      <Trash2 size={15} /> Eliminar bote
                    </button>
                  </div>
                </FormSection>
              ) : null}
            </div>

            <ModalFooter className="admin-wizard-footer">
              <div className="admin-wizard-footer__nav">
                {boatStep !== 'info' ? <button className="admin-btn admin-btn--ghost admin-wizard-footer__icon-btn" type="button" aria-label="Anterior" title="Anterior" disabled={saving} onClick={() => void goBoatStep(-1)}><ChevronLeft size={18} /></button> : null}
              </div>
              <div className="admin-wizard-footer__actions">
                <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => void saveEditor('draft')}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar borrador
                </button>
                {boatStep !== 'config' ? (
                  <button key="next" className="admin-btn admin-wizard-footer__icon-btn" type="button" aria-label="Siguiente" title="Siguiente" disabled={saving} onClick={() => void goBoatStep(1)}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                  </button>
                ) : (
                  <button key="save" className="admin-btn" type="submit" disabled={saving} aria-busy={saving}>
                    {saving ? <><Loader2 size={15} className="animate-spin" /> Guardando...</> : <><Save size={15} /> Guardar</>}
                  </button>
                )}
              </div>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteBoatImage(pendingDelete)}
        titleId="boat-image-delete-title"
        title="Eliminar imagen"
        message="Si es la principal y hay otra imagen activa, se promovera la siguiente automaticamente."
      />

      <AdminConfirmDialog
        open={Boolean(pendingBoatDelete)}
        onClose={() => setPendingBoatDelete(null)}
        onConfirm={() => pendingBoatDelete && deleteBoat(pendingBoatDelete)}
        titleId="boat-delete-title"
        title="Eliminar bote"
        loading={saving}
        confirmLabel={saving ? 'Eliminando...' : 'Eliminar bote'}
        message={
          <>
            <p>Esta acción elimina el bote y su información asociada, incluidos sus tours y paquetes. No se puede deshacer. Si el bote tiene reservas, no se podrá eliminar.</p>
            {pendingBoatDelete ? <p className="mt-3 font-semibold">{pendingBoatDelete.name}</p> : null}
          </>
        }
      />
    </div>
  );
}
