import { supabase } from '../lib/supabase';
import type { Tables } from '../types/supabase';

// Admin data + writes for the boat-centric "Tours y paquetes" editor.
//
// Every package write resolves boat_tour_id from the (boatId, tourId) pair that is
// currently being edited, so editing a package can never move it to another boat.
// The admin never sees or picks a boat_tour_id.

export type AdminTourOption = Pick<Tables<'tours'>, 'id' | 'title' | 'category' | 'publication_status' | 'active' | 'sort_order'>;
export type AdminBoatTourLink = Pick<Tables<'boat_tours'>, 'id' | 'boat_id' | 'tour_id' | 'active' | 'sort_order'>;
export type AdminPackageRow = Tables<'tour_packages'>;

export interface BoatToursPackagesData {
  tours: AdminTourOption[];
  links: AdminBoatTourLink[];
  /** Only packages whose boat_tour_id belongs to this boat. */
  packages: AdminPackageRow[];
}

export interface PackageInput {
  id: string;
  name: string;
  packageType: string;
  durationMinutes: number | null;
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  description: string | null;
  customQuote: boolean;
  active: boolean;
  sortOrder: number;
}

export function packageSlug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `package-${Date.now()}`;
}

export async function loadBoatToursPackages(boatId: string): Promise<BoatToursPackagesData> {
  const [toursRes, linksRes] = await Promise.all([
    supabase.from('tours').select('id, title, category, publication_status, active, sort_order').order('sort_order'),
    supabase.from('boat_tours').select('id, boat_id, tour_id, active, sort_order').eq('boat_id', boatId).order('sort_order'),
  ]);
  if (toursRes.error) throw new Error(toursRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);

  const links = (linksRes.data ?? []) as AdminBoatTourLink[];
  const linkIds = links.map((link) => link.id);
  const packagesRes = linkIds.length
    ? await supabase.from('tour_packages').select('*').in('boat_tour_id', linkIds).order('sort_order')
    : { data: [] as AdminPackageRow[], error: null };
  if (packagesRes.error) throw new Error(packagesRes.error.message);

  return {
    tours: (toursRes.data ?? []) as AdminTourOption[],
    links,
    packages: (packagesRes.data ?? []) as AdminPackageRow[],
  };
}

/** Find or create the boat_tours row for (boatId, tourId). Respects unique(boat_id, tour_id). */
export async function ensureBoatTourLink(boatId: string, tourId: string, sortOrderHint = 0): Promise<string> {
  const existing = await supabase
    .from('boat_tours')
    .select('id')
    .eq('boat_id', boatId)
    .eq('tour_id', tourId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data.id;

  const inserted = await supabase
    .from('boat_tours')
    .insert({ boat_id: boatId, tour_id: tourId, active: false, sort_order: sortOrderHint })
    .select('id')
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data.id;
}

export async function savePackageForBoatTour(
  boatId: string,
  tourId: string,
  input: PackageInput,
  boatMaxGuests: number,
): Promise<void> {
  const boatTourId = await ensureBoatTourLink(boatId, tourId, input.sortOrder);
  const maxGuests = Math.max(input.includedGuests, Math.min(input.maxGuests, boatMaxGuests));
  const { error } = await supabase.from('tour_packages').upsert({
    id: input.id,
    boat_tour_id: boatTourId,
    name: input.name.trim(),
    package_type: input.packageType || packageSlug(input.name),
    description: input.description,
    duration_minutes: input.durationMinutes,
    base_price: input.basePrice,
    included_guests: input.includedGuests,
    max_guests: maxGuests,
    extra_guest_price: input.extraGuestPrice,
    custom_quote: input.customQuote,
    active: input.active,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function setPackageActive(packageId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('tour_packages')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', packageId);
  if (error) throw new Error(error.message);
}

/** Hard delete. The DB blocks it (23503) if the package has booking history. */
export async function deletePackage(packageId: string): Promise<void> {
  const { error } = await supabase.from('tour_packages').delete().eq('id', packageId);
  if (error) throw new Error(error.message);
}

/** Enable a tour for a boat: ensure the link and reactivate any existing packages. */
export async function enableTourForBoat(boatId: string, tourId: string, sortOrderHint = 0): Promise<void> {
  const boatTourId = await ensureBoatTourLink(boatId, tourId, sortOrderHint);
  const { error } = await supabase
    .from('tour_packages')
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq('boat_tour_id', boatTourId);
  if (error) throw new Error(error.message);
}

/** Disable a tour for a boat without destroying packages or history. */
export async function disableTourForBoat(boatId: string, tourId: string): Promise<void> {
  const link = await supabase
    .from('boat_tours')
    .select('id')
    .eq('boat_id', boatId)
    .eq('tour_id', tourId)
    .maybeSingle();
  if (link.error) throw new Error(link.error.message);
  if (!link.data) return;

  const deactivate = await supabase
    .from('tour_packages')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('boat_tour_id', link.data.id);
  if (deactivate.error) throw new Error(deactivate.error.message);
}
