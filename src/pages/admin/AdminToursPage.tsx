import { Check, ChevronLeft, ChevronRight, Image as ImageIcon, Info, Loader2, Pencil, Plus, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import AdminImageSlots from '../../components/admin/AdminImageSlots';
import AdminStepper from '../../components/admin/AdminStepper';
import { AdminBadge, AdminCreateButton, AdminVisibilityButton, AdminFilterMenu, AdminListToolbar, AdminModuleSurface, AdminReorderHandle, AdminTable } from '../../components/admin/AdminPrimitives';
import FormSection from '../../components/admin/FormSection';
import ModalFooter from '../../components/admin/ModalFooter';
import { Modal } from '../../components/common/Modal';
import { useAdminReorder } from '../../hooks/useAdminReorder';
import { supabase } from '../../lib/supabase';
import { cleanupReplacedImage, deleteStorageImage, type StorageImage } from '../../services/imageService';
import { translateTextsToSpanish } from '../../services/translationService';
import { friendlyDeleteError } from '../../utils/adminErrors';
import { cleanList, editableList, editableText, listColumns, listTextsToTranslate, textColumns, textsToTranslate, type BilingualColumns } from '../../utils/bilingualContent';
import type { Tables } from '../../types/supabase';

type TourRow = Tables<'tours'>;
type BoatRow = Pick<Tables<'boats'>, 'id' | 'name' | 'max_guests' | 'active' | 'sort_order'>;
type BoatTourRow = Tables<'boat_tours'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;
type PublicationStatus = 'draft' | 'published' | 'inactive';
type EditorStep = 'info' | 'gallery' | 'experience' | 'config';

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
  /** True while a brand-new tour only exists in local state (no DB row yet). */
  isNew: boolean;
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
}

type FieldErrors = Partial<Record<string, string>>;

const steps: Array<{ id: EditorStep; label: string }> = [
  { id: 'info', label: 'Información' },
  { id: 'gallery', label: 'Galería' },
  { id: 'experience', label: 'Experiencia' },
  { id: 'config', label: 'Configuración' },
];

// Every public text of a tour is written in ENGLISH by the admin; DeepL generates the Spanish copy on save
// (see utils/bilingualContent.ts). legacy = the original single column, _en = English, _es = Spanish.
const TITLE: BilingualColumns = { legacy: 'title', en: 'title_en', es: 'title_es' };
const DESCRIPTION: BilingualColumns = { legacy: 'description', en: 'description_en', es: 'description_es' };
const LONG_DESCRIPTION: BilingualColumns = { legacy: 'long_description', en: 'long_description_en', es: 'long_description_es' };
const HIGHLIGHTS: BilingualColumns = { legacy: 'highlights', en: 'highlights_en', es: 'highlights_es' };
const INCLUDED: BilingualColumns = { legacy: 'included', en: 'included_en', es: 'included_es' };
const INCLUSION_LABEL: BilingualColumns = { legacy: 'label', en: 'label_en', es: 'label_es' };

/** The English content as last loaded/saved: only what differs from it is translated on the next save. */
interface TourBefore {
  title: string;
  description: string;
  longDescription: string;
  activities: string[];
  included: string[];
  inclusionLabels: Record<string, string>;
}

const emptyBefore = (): TourBefore => ({ title: '', description: '', longDescription: '', activities: [], included: [], inclusionLabels: {} });

function beforeFromRows(tour: TourRow, inclusions: TourInclusionRow[]): TourBefore {
  const row = tour as unknown as Record<string, unknown>;
  return {
    title: editableText(row, TITLE),
    description: editableText(row, DESCRIPTION),
    longDescription: editableText(row, LONG_DESCRIPTION),
    activities: editableList(row, HIGHLIGHTS),
    included: editableList(row, INCLUDED),
    inclusionLabels: Object.fromEntries(inclusions.map((item) => [item.id, editableText(item as unknown as Record<string, unknown>, INCLUSION_LABEL)])),
  };
}

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

function createEditor(tour: TourRow, images: TourImageRow[], inclusions: TourInclusionRow[]): TourEditor {
  return {
    id: tour.id, isNew: false, title: editableText(tour as unknown as Record<string, unknown>, TITLE), slug: tour.slug,
    description: editableText(tour as unknown as Record<string, unknown>, DESCRIPTION),
    longDescription: editableText(tour as unknown as Record<string, unknown>, LONG_DESCRIPTION), category: tour.category, publicationStatus: publicationStatus(tour), featured: tour.featured,
    sortOrder: tour.sort_order, activities: editableList(tour as unknown as Record<string, unknown>, HIGHLIGHTS),
    images: [...images].sort((a, b) => a.sort_order - b.sort_order),
    inclusions: inclusions.map((item) => ({ id: item.id, label: editableText(item as unknown as Record<string, unknown>, INCLUSION_LABEL), packageId: item.tour_package_id, sortOrder: item.sort_order, active: item.active, isNew: false })).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export default function AdminToursPage() {
  const [tours, setTours] = useState<TourRow[]>([]);
  const [boats, setBoats] = useState<BoatRow[]>([]);
  const [relations, setRelations] = useState<BoatTourRow[]>([]);
  const [imageRows, setImageRows] = useState<TourImageRow[]>([]);
  const [inclusionRows, setInclusionRows] = useState<TourInclusionRow[]>([]);
  const [editing, setEditing] = useState<TourEditor | null>(null);
  const [step, setStep] = useState<EditorStep>('info');
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
  // The one in-flight/finished INSERT of the tour being created. Kept for the whole
  // wizard session so Siguiente, Guardar borrador and double clicks all share it.
  const createRowRef = useRef<Promise<TourRow> | null>(null);
  const beforeRef = useRef<TourBefore>(emptyBefore());

  useEffect(() => {
    document.querySelector('.admin-tour-step-body')?.scrollTo({ top: 0 });
  }, [step]);

  async function loadTours() {
    setLoading(true);
    const [tourResult, boatResult, relationResult, imageResult, inclusionResult] = await Promise.all([
      supabase.from('tours').select('*').order('sort_order'),
      supabase.from('boats').select('id, name, max_guests, active, sort_order').order('sort_order'),
      supabase.from('boat_tours').select('*').order('sort_order'),
      supabase.from('tour_images').select('*').eq('active', true).order('sort_order'),
      supabase.from('tour_inclusions').select('*').order('sort_order'),
    ]);
    setLoading(false);
    const loadError = tourResult.error ?? boatResult.error ?? relationResult.error ?? imageResult.error ?? inclusionResult.error;
    if (loadError) { setError(loadError.message); return; }
    setTours(tourResult.data ?? []); setBoats(boatResult.data ?? []);
    setRelations(relationResult.data ?? []); setImageRows(imageResult.data ?? []); setInclusionRows(inclusionResult.data ?? []);
  }

  useEffect(() => { void loadTours(); }, []);

  function markEditing(next: TourEditor) {
    setEditing(next); setDirty(true);
    if (next.title.trim()) setFieldErrors((current) => (current.title ? { ...current, title: undefined } : current));
  }

  function focusTitleField() { window.requestAnimationFrame(() => document.getElementById('tour-title')?.focus()); }

  function openEditor(tour: TourRow) {
    const tourInclusions = inclusionRows.filter((item) => item.tour_id === tour.id);
    setEditing(createEditor(tour, imageRows.filter((item) => item.tour_id === tour.id), tourInclusions));
    beforeRef.current = beforeFromRows(tour, tourInclusions);
    createRowRef.current = null;
    setStep('info'); setFieldErrors({}); setDirty(false); setError('');
  }

  // "Crear tour" only opens the wizard with local state: nothing is written until the
  // name is valid and the user presses Siguiente or Guardar borrador (see createTourRow).
  function createTour() {
    const id = `tour-${crypto.randomUUID().slice(0, 8)}`;
    createRowRef.current = null;
    beforeRef.current = emptyBefore();
    setEditing({
      // sortOrder is a placeholder until the row actually exists — insertTourRow assigns
      // the real value from a fresh max(sort_order)+1 read, not from this count.
      id, isNew: true, title: '', slug: id, description: '', longDescription: '', category: 'Snorkeling & Beach', publicationStatus: 'draft',
      featured: false, sortOrder: 0, activities: [], images: [], inclusions: [],
    });
    setStep('info'); setFieldErrors({}); setDirty(false); setError('');
  }

  // Assigns a fresh max(sort_order)+1 read right before the insert, not `tours.length`:
  // the old count-based approach collided whenever a row had been deleted (leaving a gap
  // between the row count and the highest sort_order actually in use) — the real cause of
  // duplicate "Orden" values in the list. This still has a tiny (unavoidable without a DB
  // sequence/unique constraint, which is out of scope here) race if two tours are created
  // at the exact same instant, but it is far narrower than the previous bug, which
  // collided on every deletion, not just concurrent creates.
  async function insertTourRow(editor: TourEditor) {
    const { data: highest, error: maxError } = await supabase.from('tours').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    if (maxError) throw new Error(maxError.message);
    const nextSortOrder = (highest?.sort_order ?? 0) + 1;
    // English -> Spanish first (one request for everything typed so far); the row is created already
    // bilingual, never EN now and ES later.
    const title = editor.title.trim();
    const description = editor.description.trim();
    const longDescription = editor.longDescription.trim();
    const spanish = await translateTextsToSpanish([...textsToTranslate(title, ''), ...textsToTranslate(description, ''), ...textsToTranslate(longDescription, '')]);
    const { data, error: insertError } = await supabase.from('tours').insert({ id: editor.id, title, ...textColumns(title, '', TITLE, spanish), slug: editor.id, category: editor.category, publication_status: 'draft', active: false, featured: false, rating: 5, sort_order: nextSortOrder, description, ...textColumns(description, '', DESCRIPTION, spanish), long_description: longDescription || null, ...textColumns(longDescription, '', LONG_DESCRIPTION, spanish), highlights: [], included: [] }).select('*').single();
    if (insertError) throw new Error(insertError.message);
    beforeRef.current = { ...beforeRef.current, title, description, longDescription };
    return data;
  }

  // Creates the draft row exactly once per new tour. The id was generated when the wizard
  // opened, and the promise is shared, so a double click or Siguiente racing Guardar
  // borrador reuses the same INSERT instead of issuing a second one.
  async function createTourRow(editor: TourEditor) {
    if (!editor.isNew) return true;
    setSaving(true); setError('');
    try {
      createRowRef.current ??= insertTourRow(editor);
      const row = await createRowRef.current;
      setEditing((current) => (current && current.id === row.id ? { ...current, isNew: false, sortOrder: row.sort_order } : current));
      return true;
    } catch (caught) {
      createRowRef.current = null;
      setSaving(false);
      setError(caught instanceof Error ? caught.message : 'No se pudo crear el tour.');
      return false;
    }
  }

  // "Mostrar tour" flips draft/inactive -> published, so it must pass the same
  // validateTourForPublication check as finishTour — otherwise it was a second, looser
  // path to publish an incomplete tour (missing name and/or fewer than 3 photos).
  // "Ocultar tour" (published -> inactive) never required these fields and is unaffected.
  async function requestToggleTourPublication(tour: TourRow) {
    if (!editing) return;
    const nextStatus: PublicationStatus = publicationStatus(tour) === 'published' ? 'inactive' : 'published';
    if (nextStatus === 'published') {
      const errors = validateTourForPublication(editing);
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        setError('Completa los requisitos antes de mostrar el tour.');
        setStep(errors.title ? 'info' : 'gallery');
        if (errors.title) focusTitleField();
        return;
      }
    }
    await toggleTourPublication(tour, nextStatus);
  }

  async function toggleTourPublication(tour: TourRow, nextStatus: PublicationStatus) {
    setTogglingTourId(tour.id);
    setError(''); setNotice('');
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
    // Deleting leaves a hole in sort_order (e.g. 1..7, 9). Close it right away so the
    // numbering stays 1..N on its own; only rows whose number actually changes are written.
    const remaining = tours.filter((item) => item.id !== tour.id).sort((a, b) => a.sort_order - b.sort_order);
    let renumberError = '';
    for (const [index, item] of remaining.entries()) {
      if (item.sort_order === index + 1) continue;
      const { error: orderError } = await supabase.from('tours').update({ sort_order: index + 1 }).eq('id', item.id);
      if (orderError) { renumberError = orderError.message; break; }
    }
    if (renumberError) setError(`Tour eliminado, pero no se pudo renumerar el orden: ${renumberError}. Usa Reordenar > Guardar.`);
    else setNotice('Tour eliminado.');
    await loadTours();
  }

  function requestClose() {
    if (dirty && !window.confirm('Hay cambios sin guardar. Si cierras ahora, se perderán.')) return;
    createRowRef.current = null;
    setEditing(null); setFieldErrors({}); setDirty(false); setError('');
  }

  // Single source of truth for "can this tour go live": both "Mostrar tour" (the
  // Configuración toggle) and "Guardar" (finishTour, Paso 5's final save) call this and
  // block publishing the same way — no separate/looser path exists to publish a tour
  // that skips these checks. These are the only two functional requirements the app
  // already enforced for publishing (name + 3–6 photos, per finishTour's original
  // check); nothing new was added.
  function validateTourForPublication(editor: TourEditor) {
    const errors: FieldErrors = {};
    if (!editor.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
    if (editor.images.length < 3) errors.images = 'Agrega al menos 3 fotos para publicar el tour.';
    else if (editor.images.length > 6) errors.images = 'Máximo 6 fotografías.';
    return errors;
  }

  function missingPublicationLabels(editor: TourEditor) {
    const errors = validateTourForPublication(editor);
    const labels: string[] = [];
    if (errors.title) labels.push('Nombre del tour');
    if (errors.images) labels.push('Al menos 3 fotos');
    return labels;
  }

  // `tours.location` and `tour_locations` are no longer written here — the
  // "Ubicaciones" feature was retired from the Admin (no public consumer
  // ever read either). Existing values are left exactly as they are in the
  // database; this simply stops touching them.
  // sort_order is intentionally NOT part of this payload. The Info step never lets the
  // user edit it (it's a read-only line — "Orden de aparición actual"), and writing it
  // here was a second source of duplicate/corrupted order values: for a brand-new tour,
  // this could run with a stale `editor.sortOrder` closure from before insertTourRow's
  // real value came back, silently overwriting the freshly assigned unique value with
  // the placeholder. sort_order is now only ever written by insertTourRow (creation)
  // and persistTourOrder (Reordenar → Guardar orden).
  // Each persist* receives the Spanish translations prepared by the caller (translateTourContent), so a save
  // that touches several fields translates them all first and writes only if every translation succeeded.
  const includedLabels = (editor: TourEditor) => cleanList(editor.inclusions.filter((item) => !item.pendingDelete && item.active && item.packageId === null).map((item) => item.label));

  async function translateTourContent(editor: TourEditor, parts: { info?: boolean; experience?: boolean }) {
    const before = beforeRef.current;
    const texts: string[] = [];
    if (parts.info) texts.push(...textsToTranslate(editor.title, before.title), ...textsToTranslate(editor.description, before.description), ...textsToTranslate(editor.longDescription, before.longDescription));
    if (parts.experience) {
      texts.push(...listTextsToTranslate(cleanList(editor.activities), before.activities), ...listTextsToTranslate(includedLabels(editor), before.included));
      for (const item of editor.inclusions) if (!item.pendingDelete) texts.push(...textsToTranslate(item.label, before.inclusionLabels[item.id] ?? ''));
    }
    return translateTextsToSpanish(texts);
  }

  async function persistInfo(editor: TourEditor, spanish: Map<string, string>) {
    const before = beforeRef.current;
    const title = editor.title.trim();
    const description = editor.description.trim();
    const longDescription = editor.longDescription.trim();
    const { error: tourError } = await supabase.from('tours').update({
      title, slug: editor.slug, description, long_description: longDescription || null, category: editor.category, updated_at: new Date().toISOString(),
      ...textColumns(title, before.title, TITLE, spanish),
      ...textColumns(description, before.description, DESCRIPTION, spanish),
      ...textColumns(longDescription, before.longDescription, LONG_DESCRIPTION, spanish),
    }).eq('id', editor.id);
    if (tourError) throw new Error(tourError.message);
    beforeRef.current = { ...beforeRef.current, title, description, longDescription };
  }

  async function persistExperience(editor: TourEditor, spanish: Map<string, string>) {
    const before = beforeRef.current;
    const included = includedLabels(editor);
    const activities = cleanList(editor.activities);
    const { error: tourError } = await supabase.from('tours').update({
      highlights: activities, included, updated_at: new Date().toISOString(),
      ...listColumns(activities, before.activities, HIGHLIGHTS, spanish),
      ...listColumns(included, before.included, INCLUDED, spanish),
    }).eq('id', editor.id);
    if (tourError) throw new Error(tourError.message);
    beforeRef.current = { ...beforeRef.current, activities, included };
    for (const item of editor.inclusions) {
      if (item.pendingDelete) { if (!item.isNew) await supabase.from('tour_inclusions').delete().eq('id', item.id); continue; }
      const label = item.label.trim();
      if (!label) continue;
      const { error: inclusionError } = await supabase.from('tour_inclusions').upsert({
        id: item.id, tour_id: editor.id, tour_package_id: item.packageId, label, sort_order: item.sortOrder, active: true, updated_at: new Date().toISOString(),
        ...textColumns(label, before.inclusionLabels[item.id] ?? '', INCLUSION_LABEL, spanish),
      });
      if (inclusionError) throw new Error(inclusionError.message);
      beforeRef.current = { ...beforeRef.current, inclusionLabels: { ...beforeRef.current.inclusionLabels, [item.id]: label } };
    }
  }

  async function persistStep() {
    if (!editing) return false;
    setSaving(true); setError('');
    try {
      // Translate first (English -> Spanish); nothing is written if DeepL fails.
      const spanish = await translateTourContent(editing, { info: step === 'info', experience: step === 'experience' });
      if (step === 'info') await persistInfo(editing, spanish);
      if (step === 'experience') await persistExperience(editing, spanish);
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
      setStep('info'); focusTitleField();
      return;
    }
    if (editing.isNew && !(await createTourRow(editing))) return;
    setSaving(true); setError('');
    try {
      const spanish = await translateTourContent(editing, { info: true, experience: true });
      await persistInfo(editing, spanish); await persistExperience(editing, spanish);
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
    const errors = validateTourForPublication(editing); setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('El borrador se conserva. Completa los campos marcados antes de finalizar.'); setStep(errors.images ? 'gallery' : 'info'); if (!errors.images) focusTitleField(); return; }
    setSaving(true); setError('');
    try {
      const spanish = await translateTourContent(editing, { info: true, experience: true });
      await persistInfo(editing, spanish); await persistExperience(editing, spanish);
      const firstImage = editing.images[0];
      const { error: tourError } = await supabase.from('tours').update({ publication_status: 'published', active: true, featured: editing.featured, image_url: firstImage?.image_url ?? null, image_public_id: firstImage?.storage_path ?? null, image_alt: firstImage?.alt_text || editing.title, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (tourError) throw new Error(tourError.message);
      setSaving(false); setDirty(false); setEditing(null); setNotice('Tour guardado y activado.'); await loadTours();
    } catch (caught) { setSaving(false); setError(caught instanceof Error ? caught.message : 'No se pudo finalizar el tour.'); }
  }

  async function saveGalleryImage(image: StorageImage, slot: number) {
    if (!editing) return;
    const current = editing.images[slot];
    const payload = { tour_id: editing.id, image_url: image.public_url, storage_path: image.storage_path, alt_text: `${editing.title} photo ${slot + 1}`, alt_text_en: null, alt_text_es: null, is_primary: slot === 0, sort_order: slot + 1, active: true };
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
    // The row (and, for the cover, tours.image_public_id) already points at the new file, so the
    // previous one can go now. A failed delete keeps the old file and never undoes the change.
    const cleanup = current ? await cleanupReplacedImage(current.storage_path, image.storage_path, 'tour_images', current.id) : 'none';
    const images = [...editing.images]; images[slot] = result.data;
    markEditing({ ...editing, images: images.filter(Boolean).map((item, index) => ({ ...item, sort_order: index + 1, is_primary: index === 0 })) });
    await loadTours();
    if (cleanup === 'pending') setError('Foto cambiada. La foto anterior no se pudo borrar del almacenamiento y quedó pendiente de limpieza.');
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
  async function navigateStep(direction: -1 | 1, target?: EditorStep) {
    if (!editing || saving) return;
    if (direction === 1) {
      const errors: FieldErrors = {};
      if (step === 'info' && !editing.title.trim()) errors.title = 'El nombre del tour es obligatorio.';
      // Las fotos son requisito para activar el tour, pero no deben bloquear el acceso a Paquetes.
      setFieldErrors(errors); if (errors.title) { focusTitleField(); return; }
      if (editing.isNew && !(await createTourRow(editing))) return;
      if (!(await persistStep())) return;
    }
    const index = steps.findIndex((item) => item.id === step);
    setStep(target ?? steps[Math.max(0, Math.min(steps.length - 1, index + direction))].id);
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
          primaryAction={<AdminCreateButton label="Crear tour" disabled={reorder.reordering} onClick={createTour} />}
          reorder={{
            reordering: reorder.reordering,
            saving: reorder.saving,
            onStart: () => reorder.start(),
            onCancel: reorder.cancel,
            onSave: () => void reorder.save(persistTourOrder),
            disabledReason: canReorder ? undefined : 'Limpia la búsqueda y el filtro de publicación para reordenar.',
          }}
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
                <td>{tour.title || <span className="admin-muted">Sin nombre</span>}<div className="admin-muted admin-table__truncate" title={tour.description || tour.slug}>{tour.description || tour.slug}</div></td>
                <td>{(boatNamesByTour.get(tour.id) ?? []).length ? (boatNamesByTour.get(tour.id) ?? []).join(', ') : <span className="admin-muted">Sin bote asignado</span>}</td>
                <td><AdminBadge value={publicationStatus(tour) === 'draft' ? 'draft' : publicationStatus(tour) === 'published' ? 'active' : 'inactive'} /></td>
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
                    <button className="admin-icon-action" type="button" disabled={reorder.reordering} title="Editar tour" aria-label={`Editar tour ${tour.title || 'sin nombre'}`} onClick={() => openEditor(tour)}><Pencil size={17} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleTours.length === 0 ? <tr><td colSpan={5} className="admin-muted">No hay tours para esta búsqueda.</td></tr> : null}
          </AdminTable>
        )}
      </AdminModuleSurface>

      <Modal open={Boolean(editing)} onClose={requestClose} titleId="tour-edit-title" className="admin-tour-modal">
        {editing ? <form className="admin-modal-shell" onSubmit={(event) => { event.preventDefault(); if (editing.isNew) void navigateStep(1); else void finishTour(); }}>
          <header className="admin-modal-header"><div><h2 id="tour-edit-title" className="admin-card__title"><Pencil size={18} /> {editing.title.trim() || (editing.isNew ? 'Crear tour' : 'Editar tour')}</h2><p className="admin-muted">{steps.findIndex((item) => item.id === step) + 1} de {steps.length} · {steps.find((item) => item.id === step)?.label}</p></div><button className="admin-icon-btn" type="button" aria-label="Cerrar editor" onClick={requestClose}><X size={18} /></button></header>
          <AdminStepper label="Progreso del Tour" steps={steps} current={step} onSelect={(next) => { if (editing.isNew && next !== 'info') void navigateStep(1, next); else setStep(next); }} />
          <div className="admin-modal-body admin-tour-step-body">{error ? <div className="admin-alert admin-alert--danger" role="alert">{error}</div> : null}
            {step === 'info' ? <InfoStep editing={editing} errors={fieldErrors} onChange={markEditing} /> : null}
            {step === 'gallery' ? <GalleryStep editing={editing} errors={fieldErrors} setDeleteImage={setDeleteImage} saveImage={saveGalleryImage} /> : null}
            {step === 'experience' ? <ExperienceStep editing={editing} activityInput={activityInput} inclusionInput={inclusionInput} setActivityInput={setActivityInput} setInclusionInput={setInclusionInput} addActivity={addActivity} addInclusion={addInclusion} onChange={markEditing} /> : null}
            {step === 'config' ? <ConfigStep tour={tours.find((item) => item.id === editing.id) ?? null} missing={missingPublicationLabels(editing)} togglingTourId={togglingTourId} onToggle={requestToggleTourPublication} onRequestDelete={setPendingTourDelete} /> : null}
          </div>
          <ModalFooter className="admin-wizard-footer">
            <div className="admin-wizard-footer__nav">
              {step !== 'info' ? <button className="admin-btn admin-btn--ghost admin-wizard-footer__icon-btn" type="button" aria-label="Anterior" title="Anterior" disabled={saving} onClick={() => void navigateStep(-1)}><ChevronLeft size={18} /></button> : null}
            </div>
            <div className="admin-wizard-footer__actions">
              {step !== 'config' ? <button key="next" className="admin-btn admin-wizard-footer__icon-btn" type="button" aria-label="Siguiente" title="Siguiente" disabled={saving} onClick={() => void navigateStep(1)}>{saving ? <Loader2 className="animate-spin" size={18} /> : <ChevronRight size={18} />}</button> : <button key="save" className="admin-btn" type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>}
              <button className="admin-btn admin-btn--secondary" type="button" disabled={saving} onClick={() => void saveDraftAndClose()}>{saving ? 'Guardando...' : 'Guardar borrador'}</button>
            </div>
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
        message={pendingTourDelete ? `Esta acción elimina "${pendingTourDelete.title || 'este tour'}" y su información asociada, incluidos sus paquetes. No se puede deshacer. Si el tour tiene reservas, no se podrá eliminar.` : ''}
      />
    </div>
  );
}

function InfoStep({ editing, errors, onChange }: { editing: TourEditor; errors: FieldErrors; onChange: (value: TourEditor) => void }) {
  return <FormSection title="Información general" description="Los datos esenciales que describen el Tour." icon={<Info size={16} />}><label className="admin-field"><span className="admin-field__label">Nombre del tour</span><input id="tour-title" className="admin-input" placeholder="Ej. Fishing Tour" aria-required="true" aria-invalid={Boolean(errors.title) || undefined} aria-describedby={errors.title ? 'tour-title-error' : undefined} value={editing.title} onChange={(event) => onChange({ ...editing, title: event.target.value, slug: slugify(event.target.value) })} />{errors.title ? <span id="tour-title-error" className="admin-field-error" role="alert">{errors.title}</span> : null}</label><label className="admin-field"><span className="admin-field__label">Frase</span><textarea className="admin-input" rows={3} value={editing.description} onChange={(event) => onChange({ ...editing, description: event.target.value })} /></label><label className="admin-field"><span className="admin-field__label">Descripción</span><textarea className="admin-input admin-textarea-list" value={editing.longDescription} onChange={(event) => onChange({ ...editing, longDescription: event.target.value })} /></label></FormSection>;
}

function GalleryStep({ editing, errors, setDeleteImage, saveImage }: { editing: TourEditor; errors: FieldErrors; setDeleteImage: (value: TourImageRow | null) => void; saveImage: (image: StorageImage, slot: number) => Promise<void> }) {
  const slots = editing.images.map((image, index) => ({ id: image.id, url: image.image_url, alt: image.alt_text, cover: index === 0 }));
  return (
    <FormSection title="Galería" description="Mínimo 3 imágenes para continuar." icon={<ImageIcon size={16} />}>
      {errors.images ? <div className="admin-alert admin-alert--danger admin-gallery-error" role="alert">{errors.images}</div> : null}
      <AdminImageSlots
        images={slots}
        onDelete={(item) => setDeleteImage(editing.images.find((image) => image.id === item.id) ?? null)}
        fallbackAlt={(index) => `${editing.title} foto ${index + 1}`}
        renderManager={(index, image, picker) => (
          <AdminImageManager {...picker} resourceTable="tours" resourceId={editing.id} folder="tours" currentImageUrl={image?.url} currentStoragePath={editing.images[index]?.storage_path} label={`${editing.title} foto ${index + 1}`} aspect={3 / 2} maxWidth={1200} maxHeight={800} maxSizeMB={0.35} retainPreviousOnUpload requireReplacementToDelete onImageSaved={(saved) => saveImage(saved, index)} />
        )}
      />
    </FormSection>
  );
}

interface TagListItem { key: string; label: string; removeLabel: string; onRemove: () => void }

// "input + Agregar" row with the added entries listed below as removable chips.
// Presentation only: callers keep persisting exactly the same arrays.
function TagListField({ id, label, placeholder, value, onValueChange, onAdd, addLabel, items }: { id: string; label: string; placeholder: string; value: string; onValueChange: (value: string) => void; onAdd: () => void; addLabel: string; items: TagListItem[] }) {
  const canAdd = value.trim().length > 0;
  return (
    <div className="admin-tour-list-field">
      <label className="admin-field__label" htmlFor={id}>{label}</label>
      <div className="admin-tour-list-field__add">
        <input
          id={id}
          className="admin-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          // Enter adds the entry; without this it would submit the whole wizard form.
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (canAdd) onAdd(); } }}
        />
        <button className="admin-btn admin-btn--secondary" type="button" aria-label={addLabel} disabled={!canAdd} onClick={onAdd}><Plus size={14} /> Agregar</button>
      </div>
      {items.length ? (
        <ul className="admin-token-list" aria-label={`Lista de ${label.toLowerCase()}`}>
          {items.map((item) => (
            <li className="admin-token" key={item.key}>
              <span>{item.label}</span>
              <button type="button" aria-label={item.removeLabel} title="Quitar" onClick={item.onRemove}><X size={14} /></button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ExperienceStep({ editing, activityInput, inclusionInput, setActivityInput, setInclusionInput, addActivity, addInclusion, onChange }: { editing: TourEditor; activityInput: string; inclusionInput: string; setActivityInput: (value: string) => void; setInclusionInput: (value: string) => void; addActivity: () => void; addInclusion: () => void; onChange: (value: TourEditor) => void }) {
  return (
    <FormSection title="Actividades e incluye" description="Lo que se hace en el tour y lo que incluye." icon={<Check size={16} />}>
      <TagListField
        id="tour-activity-input"
        label="Actividades del tour"
        placeholder="e.g. Sport fishing"
        value={activityInput}
        onValueChange={setActivityInput}
        onAdd={addActivity}
        addLabel="Agregar actividad"
        items={editing.activities.map((item, index) => ({
          key: `${index}-${item}`,
          label: item,
          removeLabel: `Eliminar actividad ${item}`,
          onRemove: () => onChange({ ...editing, activities: editing.activities.filter((_, currentIndex) => currentIndex !== index) }),
        }))}
      />
      <TagListField
        id="tour-inclusion-input"
        label="Incluye"
        placeholder="e.g. Drinks"
        value={inclusionInput}
        onValueChange={setInclusionInput}
        onAdd={addInclusion}
        addLabel="Agregar a incluye"
        items={editing.inclusions.filter((item) => !item.pendingDelete).map((item) => ({
          key: item.id,
          label: item.label,
          removeLabel: `Eliminar ${item.label}`,
          onRemove: () => onChange({ ...editing, inclusions: editing.inclusions.map((current) => current.id === item.id ? { ...current, pendingDelete: true } : current) }),
        }))}
      />
    </FormSection>
  );
}

// Same immediate, standalone actions the table row used to expose
// directly (toggle takes effect on click, independent of the wizard's own
// "Finalizar" save) — only their location moved, not when/how they run.
function ConfigStep({ tour, missing, togglingTourId, onToggle, onRequestDelete }: { tour: TourRow | null; missing: string[]; togglingTourId: string | null; onToggle: (tour: TourRow) => void | Promise<void>; onRequestDelete: (tour: TourRow) => void }) {
  if (!tour) return null;
  const status = publicationStatus(tour);
  const isPublished = status === 'published';
  const hint = isPublished
    ? 'Visible en el sitio público y disponible para reservas.'
    : status === 'draft'
      ? 'No aparece en el sitio público ni puede reservarse.'
      : 'Oculto: no aparece en el sitio público ni se puede reservar.';
  return (
    <>
      <FormSection title="Estado y visibilidad" description="Controla si este tour aparece en el sitio público." icon={<Settings size={16} />}>
        <div className="admin-tour-config-row admin-tour-config-row--tour">
          <div className="admin-tour-config-row__status">
            <p className="admin-config-row__label">Estado actual</p>
            <AdminBadge value={isPublished ? 'active' : status === 'draft' ? 'draft' : 'inactive'} />
            <p className="admin-muted">{hint}</p>
            {!isPublished ? (
              missing.length ? (
                <div className="admin-tour-missing">
                  <p className="admin-tour-missing__title">Requisitos pendientes</p>
                  <ul>{missing.map((label) => <li key={label}>{label}</li>)}</ul>
                </div>
              ) : (
                <p className="admin-tour-ready"><Check size={14} aria-hidden="true" /> Listo para publicar.</p>
              )
            ) : null}
          </div>
          {/* Shows the CURRENT state ("Visible" / "No visible"); the accessible name says what pressing does. */}
          <AdminVisibilityButton visible={isPublished} busy={togglingTourId === tour.id} actionLabel={isPublished ? 'Ocultar tour' : 'Mostrar tour'} onClick={() => void onToggle(tour)} />
        </div>
        <div className="admin-tour-config-divider" role="separator" />
        <div className="admin-tour-danger-row">
          <div>
            <strong>Eliminar tour</strong>
            <p className="admin-muted">Esta acción elimina el tour y su información asociada. No se puede deshacer.</p>
          </div>
          <button className="admin-btn admin-btn--danger" type="button" onClick={() => onRequestDelete(tour)}>
            <Trash2 size={15} /> Eliminar tour
          </button>
        </div>
      </FormSection>
    </>
  );
}
