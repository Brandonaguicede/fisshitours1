import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Image as ImageIcon, ImagePlus, Info, Loader2, Pencil, Plus, Save, Settings2, Star, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminPageHeader, AdminReorderHandle, AdminReorderToolbar, AdminTable } from '../../components/admin/AdminPrimitives';
import BoatToursPackagesEditor from '../../components/admin/BoatToursPackagesEditor';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage } from '../../services/imageService';
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
// labelEs/labelEn are directly editable here (not just filled by "Traducir
// todo el sitio") — DeepL can mistranslate a technical term (e.g. "tuna
// tube" once came back as "Remember the tube"), and the admin needs a real
// way to fix that without it being silently overwritten by the next
// translation run. `label` (legacy) is kept in sync automatically on save
// — es || en || label — purely for whatever, if anything, still reads it
// internally; it has no input of its own anymore.
interface BoatEquipmentEditItem {
  id: string;
  label: string;
  labelEs: string;
  labelEn: string;
  sortOrder: number;
  isNew?: boolean;
  pendingDelete?: boolean;
}

interface BoatRow {
  id: string;
  slug: string;
  name: string;
  images: string[];
  badge: string | null;
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

export default function AdminBoatsPage() {
  const db = supabase as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [boats, setBoats] = useState<BoatRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<BoatRow | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BoatImageRow | null>(null);
  const [pendingBoatDelete, setPendingBoatDelete] = useState<BoatRow | null>(null);
  const [boatTab, setBoatTab] = useState<'general' | 'tours'>('general');
  const [saving, setSaving] = useState(false);
  const [startingPrices, setStartingPrices] = useState<Record<string, number>>({});
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; maxGuests?: string; images?: string }>({});
  const [search, setSearch] = useState('');
  const [boatStatusFilter, setBoatStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [equipmentInput, setEquipmentInput] = useState('');

  const isValidActiveImageCount = (count: number) => count >= 3 && count <= 6;

  async function loadBoats() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('boats')
      .select('id, slug, name, images, badge, length, engine, featured_spec, max_guests, image_url, image_public_id, active, sort_order')
      .order('sort_order', { ascending: true });

    if (error) {
      setLoading(false);
      setBoats([]);
      setError(error.message);
      return;
    }

    const rows = ((data ?? []) as BoatRow[]).map((boat) => ({ ...boat, images: Array.isArray(boat.images) ? boat.images : [] }));
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
        current.push({ id: item.id, label: item.label, labelEs: item.label_es ?? '', labelEn: item.label_en ?? '', sortOrder: item.sort_order });
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

  // Deep link from Tours / Paquetes: /admin/boats?boatId=<id> opens the boat on its
  // "Tours y paquetes" tab.
  useEffect(() => {
    const requestedId = searchParams.get('boatId');
    if (!requestedId || !boats || editing) return;
    const target = boats.find((boat) => boat.id === requestedId);
    if (!target) return;
    openEditor(target);
    setBoatTab('tours');
    setSearchParams((current) => {
      current.delete('boatId');
      return current;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boats, searchParams]);

  function openEditor(boat: BoatRow) {
    setEditing(boat);
    setBoatTab('general');
    setFieldErrors({});
    setEquipmentInput('');
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    setSelectedImageId((images.find((image) => image.is_primary) ?? images[0])?.id ?? null);
  }

  async function createBoat() {
    setNotice('');
    setError('');
    setFieldErrors({});
    setBoatTab('general');
    const id = `nuevo-bote-${Date.now()}`;
    setEditing({
      id,
      slug: id,
      name: '',
      images: [],
      badge: '',
      length: '',
      engine: '',
      featured_spec: '',
      max_guests: 10,
      image_url: null,
      image_public_id: null,
      active: false,
      sort_order: (boats?.length ?? 0) + 1,
      boat_images: [],
      equipment: [],
    });
    setSelectedImageId(null);
    setEquipmentInput('');
  }

  async function closeEditor() {
    setEditing(null);
    setSelectedImageId(null);
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
      .select('id, slug, name, images, badge, length, engine, featured_spec, max_guests, image_url, image_public_id, active, sort_order')
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
      ...rawBoat,
      images: Array.isArray(rawBoat.images) ? rawBoat.images.filter((item): item is string => typeof item === 'string') : [],
      boat_images: (imagesResult.data ?? []) as BoatImageRow[],
      equipment: ((equipmentResult.data ?? []) as Array<{ id: string; label: string; label_es: string | null; label_en: string | null; sort_order: number }>)
        .map((item) => ({ id: item.id, label: item.label, labelEs: item.label_es ?? '', labelEn: item.label_en ?? '', sortOrder: item.sort_order })),
    };
    setEditing(boat);
    setEquipmentInput('');
    const images = boat.boat_images?.length ? boat.boat_images : fallbackBoatImages(boat);
    setSelectedImageId((current) => current ?? (images.find((image) => image.is_primary) ?? images[0])?.id ?? null);
  }

  // "Guardar" publishes (requires everything a public boat needs); "Guardar
  // borrador" only needs the bare minimum to create/keep the row and can
  // always be used to leave mid-edit without losing progress or without
  // forcing an incomplete boat live.
  async function saveEditor(mode: 'draft' | 'publish') {
    if (!editing || saving) return;
    const nextFieldErrors: typeof fieldErrors = {};
    const isExisting = Boolean(boats?.some((boat) => boat.id === editing.id));
    const name = editing.name.trim();
    if (!name) {
      nextFieldErrors.name = 'El nombre es obligatorio.';
    }
    if (mode === 'publish') {
      if (!Number.isFinite(editing.max_guests) || editing.max_guests < 1) {
        nextFieldErrors.maxGuests = 'La capacidad debe ser al menos 1.';
      } else if (editing.id === 'segundo-viento' && editing.max_guests > 10) {
        nextFieldErrors.maxGuests = 'Second Wind no puede superar 10 pasajeros.';
      }
      const activeImageCount = (editing.boat_images?.length ? editing.boat_images : fallbackBoatImages(editing)).filter((image) => image.active).length;
      if (!isValidActiveImageCount(activeImageCount)) {
        nextFieldErrors.images = 'Para publicar el bote necesitas entre 3 y 6 imagenes.';
      }
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError(mode === 'publish' ? 'Revisa los campos marcados antes de publicar.' : 'Revisa los campos marcados antes de guardar el borrador.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    // Generated once here, on creation, and never re-derived from the name
    // afterwards — an existing row's own id/slug are reused as-is on every
    // later save, so they can never silently drift or collide once live.
    const id = isExisting ? editing.id : uniqueBoatId(name, new Set((boats ?? []).map((boat) => boat.id)));
    const slug = isExisting ? editing.slug : slugify(name);
    const payload = {
      slug,
      name,
      badge: editing.badge?.trim() || null,
      length: editing.length?.trim() || null,
      engine: editing.engine?.trim() || null,
      // featured_spec is no longer written here — "Equipamiento" now lives
      // in boat_equipment, one row per item, edited below.
      max_guests: editing.max_guests,
      active: mode === 'publish',
      sort_order: editing.sort_order,
      images: editing.images ?? [],
      image_url: editing.image_url,
      image_public_id: editing.image_public_id,
      updated_at: new Date().toISOString(),
    };
    const { error } = isExisting
      ? await supabase.from('boats').update(payload).eq('id', editing.id)
      : await supabase.from('boats').insert({ ...payload, id });
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    for (const item of editing.equipment) {
      if (item.pendingDelete) {
        if (!item.isNew) await supabase.from('boat_equipment').delete().eq('id', item.id);
        continue;
      }
      const labelEs = item.labelEs.trim();
      const labelEn = item.labelEn.trim();
      // `label` (legacy) is kept in sync automatically — es first, then en,
      // then whatever was already there — never a separate input of its
      // own. A row needs at least one of the three to be worth saving.
      const label = labelEs || labelEn || item.label.trim();
      if (!label) continue;
      const { error: equipmentError } = await supabase.from('boat_equipment').upsert({
        id: item.id,
        boat_id: id,
        label,
        label_es: labelEs || null,
        label_en: labelEn || null,
        sort_order: item.sortOrder,
        active: true,
        updated_at: new Date().toISOString(),
      });
      if (equipmentError) {
        setSaving(false);
        setError(equipmentError.message);
        return;
      }
    }

    setSaving(false);
    setNotice(mode === 'publish' ? 'Bote publicado.' : 'Borrador guardado.');
    await refreshEditing(id);
  }

  // Quick-add: typed once, goes straight into the Español field (same
  // "admin writes Spanish" convention as the rest of this admin) so it's
  // immediately visible instead of landing in two blank inputs — English is
  // left empty, which is exactly the signal "Traducir todo el sitio" (or
  // the admin, directly in the English field below) needs to fill it in.
  // If what was typed is actually already English, DeepL just returns it
  // unchanged when asked to translate it "to English" — self-correcting,
  // no harm either way.
  function addEquipmentItem() {
    if (!editing || !equipmentInput.trim()) return;
    const text = equipmentInput.trim();
    setEditing({
      ...editing,
      equipment: [...editing.equipment, { id: crypto.randomUUID(), label: text, labelEs: text, labelEn: '', sortOrder: editing.equipment.length + 1, isNew: true }],
    });
    setEquipmentInput('');
  }

  function updateEquipmentLabelEs(itemId: string, labelEs: string) {
    if (!editing) return;
    setEditing({ ...editing, equipment: editing.equipment.map((item) => (item.id === itemId ? { ...item, labelEs } : item)) });
  }

  function updateEquipmentLabelEn(itemId: string, labelEn: string) {
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
    setNotice('Bote eliminado.');
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
    setSelectedImageId((data as BoatImageRow).id);
    await refreshEditing(editing.id);
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
    setSelectedImageId(image.id);
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
    setSelectedImageId((remaining.find((item) => item.is_primary) ?? remaining[0])?.id ?? null);
    setNotice('Imagen eliminada del bote.');
    await refreshEditing(editing.id);
  }

  async function copyUrl(url: string) {
    await navigator.clipboard?.writeText(url);
    setNotice('URL copiada.');
  }

  // editing.boat_images is always real (or []) — see loadBoats()/refreshEditing(). The
  // synthetic legacy preview is applied ONLY here, for display, and every row it produces
  // carries `synthetic: true` so the actions below know not to wire real writes to it.
  const editorImages = useMemo(() => (editing?.boat_images?.length ? editing.boat_images : editing ? fallbackBoatImages(editing) : []), [editing]);
  const selectedImage = editorImages.find((image) => image.id === selectedImageId) ?? editorImages.find((image) => image.is_primary) ?? editorImages[0] ?? null;
  const isExistingBoat = Boolean(editing && boats?.some((boat) => boat.id === editing.id));
  // True while we're showing the boat's legacy boats.images/image_url as a read-only
  // preview because it has no boat_images rows yet.
  const isLegacyPreview = Boolean(editing && !editing.boat_images?.length && editorImages.length > 0);
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
              void saveEditor('publish');
            }}
          >
            <header className="admin-modal-header">
              <h2 id="boat-edit-title" className="admin-card__title"><Pencil size={18} /> {boats?.some((boat) => boat.id === editing.id) ? 'Editar bote' : 'Crear bote'}</h2>
              <button className="admin-icon-btn" type="button" aria-label="Cerrar" disabled={saving} onClick={() => void closeEditor()}><X size={18} /></button>
            </header>

            <div className="admin-modal-body">
              {error ? (
                <div className="admin-alert admin-alert--danger" role="alert">
                  {needsEditorNotice(error)
                    ? 'No se pudo guardar: se requiere una sesion de admin/editor en Supabase.'
                    : error}
                </div>
              ) : null}

              {isExistingBoat ? (
                <div className="admin-actions" role="tablist" aria-label="Secciones del bote">
                  <button type="button" className={boatTab === 'general' ? 'admin-btn' : 'admin-btn admin-btn--ghost'} onClick={() => setBoatTab('general')}>General</button>
                  <button type="button" className={boatTab === 'tours' ? 'admin-btn' : 'admin-btn admin-btn--ghost'} onClick={() => setBoatTab('tours')}>Tours y paquetes</button>
                </div>
              ) : null}

              {isExistingBoat && boatTab === 'tours' ? (
                <BoatToursPackagesEditor boatId={editing.id} boatName={editing.name} boatMaxGuests={editing.max_guests} />
              ) : (
              <>
              <FormSection
                title="Imagen del bote"
                description={isExistingBoat ? 'Sube nuevas fotos, ordena la galeria y elige la imagen principal.' : 'Guarda la informacion del bote para habilitar la carga de imagenes.'}
                icon={<ImageIcon size={16} />}
              >
                <section className="admin-boat-images">
                  {isExistingBoat ? (
                    <>
                      <div className="admin-boat-images__main">
                        {selectedImage ? (
                          <img src={selectedImage.image_url} alt={selectedImage.alt_text || editing.name} loading="eager" decoding="async" />
                        ) : (
                          <div className="admin-boat-images__empty"><ImagePlus size={28} /> Sin imagenes del bote</div>
                        )}
                        <span className="admin-boat-images__badge">Imagen principal</span>
                        {selectedImage && !selectedImage.is_primary && !selectedImage.synthetic ? (
                          <button className="admin-boat-images__primary admin-btn" type="button" onClick={() => void setPrimaryImage(selectedImage)}>
                            <Star size={14} /> Marcar principal
                          </button>
                        ) : null}
                        {editorImages.length > 1 ? (
                          <>
                            <button className="admin-boat-images__arrow admin-boat-images__arrow--prev" type="button" aria-label="Imagen anterior" onClick={() => setSelectedImageId(editorImages[(Math.max(editorImages.findIndex((image) => image.id === selectedImage?.id), 0) - 1 + editorImages.length) % editorImages.length].id)}><ArrowLeft size={18} /></button>
                            <button className="admin-boat-images__arrow admin-boat-images__arrow--next" type="button" aria-label="Imagen siguiente" onClick={() => setSelectedImageId(editorImages[(Math.max(editorImages.findIndex((image) => image.id === selectedImage?.id), 0) + 1) % editorImages.length].id)}><ArrowRight size={18} /></button>
                          </>
                        ) : null}
                      </div>

                      <div className="admin-boat-images__thumbs" role="list" aria-label="Imagenes del bote">
                        {editorImages.map((image, index) => (
                          <div className={`admin-boat-thumb${image.id === selectedImage?.id ? ' admin-boat-thumb--selected' : ''}`} key={image.id} role="listitem">
                            <button type="button" aria-label={`Ver imagen ${index + 1}`} onClick={() => setSelectedImageId(image.id)}>
                              <img src={image.image_url} alt="" loading="lazy" decoding="async" />
                            </button>
                            <div className="admin-boat-thumb__actions">
                              {image.synthetic ? null : (
                                <>
                                  <button type="button" aria-label="Marcar como principal" onClick={() => void setPrimaryImage(image)}><Star size={14} /></button>
                                  <button type="button" aria-label="Mover a la izquierda" onClick={() => void moveImage(image, -1)}><ArrowUp size={14} /></button>
                                  <button type="button" aria-label="Mover a la derecha" onClick={() => void moveImage(image, 1)}><ArrowDown size={14} /></button>
                                </>
                              )}
                              <button type="button" aria-label="Copiar URL" title={image.image_url} onClick={() => void copyUrl(image.image_url)}><Copy size={14} /></button>
                              {image.synthetic ? null : (
                                <button type="button" aria-label="Eliminar imagen" onClick={() => setPendingDelete(image)}><Trash2 size={14} /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {isLegacyPreview ? (
                        <p className="admin-field-help" role="status">
                          Estas fotos pertenecen al formato anterior y se muestran solo como referencia. Las nuevas imagenes del bote se administran desde la galeria actual.
                        </p>
                      ) : null}

                      <AdminImageManager
                        resourceTable="boats"
                        resourceId={editing.id}
                        folder="boats"
                        label={`${editing.name || 'Bote'} galeria`}
                        aspect={16 / 9}
                        maxWidth={1600}
                        maxHeight={900}
                        maxSizeMB={0.6}
                      disabled={(editing.boat_images?.length ?? 0) >= 6}
                        retainPreviousOnUpload
                        onImageSaved={onGalleryImageSaved}
                      />
                      <p className="admin-field-help" aria-live="polite">
                        {editorImages.length} / 6 imagenes. Para publicar el bote necesitas entre 3 y 6 imagenes.
                      </p>
                      {fieldErrors.images ? <span className="admin-field-error">{fieldErrors.images}</span> : null}
                    </>
                  ) : (
                    <div className="admin-empty">
                      Completa los datos y guarda el bote (borrador o publicado). Despues podras subir sus fotos.
                      {fieldErrors.images ? <span className="admin-field-error">{fieldErrors.images}</span> : null}
                    </div>
                  )}
                </section>
              </FormSection>

              <div className="admin-form-columns">
                <FormSection title="Informacion general" description="Datos que identifican al bote." icon={<Info size={16} />}>
                  <label className="admin-field">
                    <span className="admin-field__label">Nombre</span>
                    <input id="boat-name" name="name" className="admin-input" aria-invalid={fieldErrors.name ? true : undefined} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                    {fieldErrors.name ? <span className="admin-field-error">{fieldErrors.name}</span> : null}
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Etiqueta</span>
                    <input id="boat-badge" name="badge" className="admin-input" value={editing.badge ?? ''} onChange={(event) => setEditing({ ...editing, badge: event.target.value || null })} placeholder="Ej. Luxury meets nature" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Eslora</span>
                    <input id="boat-length" name="length" className="admin-input" value={editing.length ?? ''} onChange={(event) => setEditing({ ...editing, length: event.target.value || null })} placeholder="Ej. 32 pies" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field__label">Motor</span>
                    <input id="boat-engine" name="engine" className="admin-input" value={editing.engine ?? ''} onChange={(event) => setEditing({ ...editing, engine: event.target.value || null })} placeholder="Ej. 2x Yamaha 250HP" />
                  </label>
                </FormSection>

                <FormSection title="Capacidad" description="Capacidad fisica del bote. El precio, las personas incluidas y el precio por persona adicional se configuran por paquete en cada tour (Tours &gt; Paquetes)." icon={<Users size={16} />}>
                  <label className="admin-field">
                    <span className="admin-field__label">Capacidad maxima</span>
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
                    <span className="admin-field-help">Techo fisico del bote. Ningun paquete deberia superar este numero de huespedes.</span>
                    {fieldErrors.maxGuests ? <span className="admin-field-error">{fieldErrors.maxGuests}</span> : null}
                  </label>
                </FormSection>
              </div>

              <FormSection title="Equipamiento" description="Un item por bote. Español/English se traducen automaticamente con 'Traducir todo el sitio' en Admin > Contenido cuando falten, pero siempre puedes corregirlos aqui a mano — una correccion manual nunca se sobrescribe." icon={<Settings2 size={16} />}>
                <div className="admin-field">
                  <span className="admin-field__label">Equipamiento a bordo</span>
                  {(() => {
                    const visibleEquipment = editing.equipment.filter((item) => !item.pendingDelete).sort((a, b) => a.sortOrder - b.sortOrder);
                    return visibleEquipment.length ? (
                      <ul className="admin-token-list grid gap-2" aria-label="Lista de equipamiento">
                        {visibleEquipment.map((item, index) => (
                          <li className="grid gap-2 rounded-lg border border-white/10 p-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" key={item.id}>
                            <label className="grid gap-1">
                              <span className="text-xs font-bold uppercase tracking-wide text-white/60">Español</span>
                              <input
                                className="admin-input"
                                value={item.labelEs}
                                placeholder={item.label || 'Ej. GPS Garmin'}
                                onChange={(event) => updateEquipmentLabelEs(item.id, event.target.value)}
                                aria-label={`Español: ${item.labelEs || item.label}`}
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs font-bold uppercase tracking-wide text-white/60">English</span>
                              <input
                                className="admin-input"
                                value={item.labelEn}
                                placeholder={item.label || 'e.g. Garmin GPS'}
                                onChange={(event) => updateEquipmentLabelEn(item.id, event.target.value)}
                                aria-label={`English: ${item.labelEn || item.label}`}
                              />
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button type="button" className="admin-icon-action" aria-label={`Subir ${item.label}`} title="Subir" disabled={index === 0} onClick={() => moveEquipmentItem(item.id, -1)}><ArrowUp size={14} /></button>
                              <button type="button" className="admin-icon-action" aria-label={`Bajar ${item.label}`} title="Bajar" disabled={index === visibleEquipment.length - 1} onClick={() => moveEquipmentItem(item.id, 1)}><ArrowDown size={14} /></button>
                              <button type="button" className="admin-icon-action admin-icon-action--danger" aria-label={`Eliminar ${item.label}`} title="Quitar" onClick={() => removeEquipmentItem(item.id)}><Trash2 size={14} /></button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null;
                  })()}
                  <div className="admin-tour-list-field__add">
                    <input
                      id="boat-equipment-input"
                      className="admin-input"
                      value={equipmentInput}
                      placeholder="Ej. Garmin GPS"
                      onChange={(event) => setEquipmentInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEquipmentItem(); } }}
                    />
                    <button className="admin-btn admin-btn--secondary" type="button" aria-label="Agregar equipamiento" disabled={!equipmentInput.trim()} onClick={addEquipmentItem}><Plus size={14} /> Agregar</button>
                  </div>
                  <span className="admin-field-help">Lo que escribas arriba se agrega en Español; English queda pendiente hasta que lo traduzcas o lo escribas tu. Se mostraran como chips de equipamiento en la pagina.</span>
                </div>
              </FormSection>

              <FormSection title="Estado y configuracion" description="Controla visibilidad y orden en el sitio publico." icon={<Settings2 size={16} />}>
                <div className="admin-config-row">
                  <div>
                    <p className="admin-config-row__label">Estado actual</p>
                    <AdminBadge value={editing.active} />
                  </div>
                  <p className="admin-muted">
                    {isExistingBoat
                      ? 'Lo decide el botón que uses abajo: "Guardar" publica, "Guardar borrador" lo retira del sitio.'
                      : '"Guardar" lo publica de inmediato; "Guardar borrador" lo deja listo para terminarlo después.'}
                  </p>
                </div>
                <p className="admin-field-help">Orden de despliegue actual: {editing.sort_order}. Se reordena desde la lista de botes.</p>
              </FormSection>
              <FormSection title="Zona de peligro" description="Esta acción no se puede deshacer." icon={<Trash2 size={16} />}>
                <div className="admin-danger-zone">
                  <p className="admin-muted">Elimina este bote y su información asociada. Si tiene reservas o paquetes con historial, la base de datos bloqueará la eliminación.</p>
                  <button className="admin-btn admin-btn--danger" type="button" onClick={() => setPendingBoatDelete(editing)}>
                    <Trash2 size={15} /> Eliminar bote
                  </button>
                </div>
              </FormSection>
              </>
              )}
            </div>

            <ModalFooter>
              <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => void saveEditor('draft')}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar borrador
              </button>
              <button className="admin-btn" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? (
                  <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                ) : (
                  <><Save size={15} /> Guardar</>
                )}
              </button>
              <button className="admin-btn admin-btn--ghost" type="button" disabled={saving} onClick={() => void closeEditor()}>Cancelar</button>
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
            <p>Esta accion elimina el bote y sus asociaciones. Si tiene reservas historicas, la base de datos puede bloquear la eliminacion.</p>
            {pendingBoatDelete ? <p className="mt-3 font-semibold">{pendingBoatDelete.name}</p> : null}
          </>
        }
      />
    </div>
  );
}
