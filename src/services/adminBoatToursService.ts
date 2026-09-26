import { supabase } from '../lib/supabase';
import type { Tables } from '../types/supabase';
import { findPackageIssues, PackageIncompleteError, type PackageFacts } from '../utils/packageRequirements';

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
  timeSlots: Tables<'time_slots'>[];
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
  departureTimes: string[] | null;
  mealOptions: Array<{ es: string; en: string }>;
  packageIncluded: string[] | null;
  /**
   * English/Spanish copies of packageIncluded that the public site reads (package_included_es / _en).
   * `undefined` = leave the stored columns untouched (the list did not change); `null` = clear them
   * (the package goes back to inheriting the tour's list); an array = write it.
   */
  packageIncludedEs?: string[] | null;
  packageIncludedEn?: string[] | null;
  /** name_en/name_es, description_en/description_es: only the columns whose English changed (see bilingualContent). */
  bilingual?: Record<string, unknown>;
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
  const [toursRes, linksRes, slotsRes] = await Promise.all([
    supabase.from('tours').select('id, title, category, publication_status, active, sort_order').order('sort_order'),
    supabase.from('boat_tours').select('id, boat_id, tour_id, active, sort_order').eq('boat_id', boatId).order('sort_order'),
    supabase.from('time_slots').select('*').eq('active', true).order('sort_order'),
  ]);
  if (toursRes.error) throw new Error(toursRes.error.message);
  if (slotsRes.error) throw new Error(slotsRes.error.message);
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
    timeSlots: slotsRes.data ?? [],
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

/** Active shared departure times (what a package with no own list of hours falls back to). */
async function countSharedTimeSlots(): Promise<number> {
  const { count, error } = await supabase.from('time_slots').select('id', { count: 'exact', head: true }).eq('active', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const rowFacts = (row: AdminPackageRow, sharedTimeCount: number): PackageFacts => ({
  name: row.name,
  customQuote: row.custom_quote,
  basePrice: row.base_price == null ? null : Number(row.base_price),
  includedGuests: row.included_guests,
  maxGuests: row.max_guests,
  extraGuestPrice: row.extra_guest_price == null ? null : Number(row.extra_guest_price),
  durationMinutes: row.duration_minutes,
  departureTimes: row.departure_times,
  sharedTimeCount,
});

/** What a stored package is missing to be bookable (same rules as the form, the service layer and the public catalog). */
export const packageRowIssues = (row: AdminPackageRow, sharedTimeCount: number) => findPackageIssues(rowFacts(row, sharedTimeCount));

/** Last line of defence (the form validates too): nothing may become ACTIVE unless a customer could actually book it. */
export async function assertPackageCanBeActive(row: AdminPackageRow): Promise<void> {
  const issues = findPackageIssues(rowFacts(row, row.departure_times == null ? await countSharedTimeSlots() : 0));
  if (issues.length) throw new PackageIncompleteError(row.id, issues);
}

export async function savePackageForBoatTour(
  boatId: string,
  tourId: string,
  input: PackageInput,
  boatMaxGuests: number,
): Promise<void> {
  const maxGuests = Math.max(input.includedGuests, Math.min(input.maxGuests, boatMaxGuests));
  if (input.active) {
    const issues = findPackageIssues({
      name: input.name, customQuote: input.customQuote, basePrice: input.basePrice, includedGuests: input.includedGuests, maxGuests,
      extraGuestPrice: input.extraGuestPrice, durationMinutes: input.durationMinutes, departureTimes: input.departureTimes,
      sharedTimeCount: input.departureTimes == null ? await countSharedTimeSlots() : 0,
    });
    if (issues.length) throw new PackageIncompleteError(input.id, issues);
  }
  const boatTourId = await ensureBoatTourLink(boatId, tourId, input.sortOrder);
  const { error } = await supabase.from('tour_packages').upsert({
    id: input.id,
    boat_tour_id: boatTourId,
    name: input.name.trim(),
    package_type: input.packageType || packageSlug(input.name),
    description: input.description,
    departure_times: input.departureTimes,
    meal_options: input.mealOptions,
    package_included: input.packageIncluded,
    // Only when the list changed: a matching, freshly translated pair (see BoatToursPackagesEditor).
    ...(input.packageIncludedEs !== undefined ? { package_included_es: input.packageIncludedEs, package_included_en: input.packageIncludedEn ?? null } : {}),
    ...(input.bilingual ?? {}),
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
  if (active) {
    const current = await supabase.from('tour_packages').select('*').eq('id', packageId).single();
    if (current.error) throw new Error(current.error.message);
    await assertPackageCanBeActive(current.data as AdminPackageRow);
  }
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

/**
 * Enable a tour for a boat: ensure the link and reactivate the existing packages that can be booked. A package that is
 * incomplete stays hidden (it would break the booking) and is reported back so the admin can finish it.
 */
export async function enableTourForBoat(boatId: string, tourId: string, sortOrderHint = 0): Promise<{ skipped: Array<{ id: string; name: string }> }> {
  const boatTourId = await ensureBoatTourLink(boatId, tourId, sortOrderHint);
  const link = await supabase
    .from('boat_tours')
    .update({ active: true })
    .eq('id', boatTourId);
  if (link.error) throw new Error(link.error.message);
  const packages = await supabase.from('tour_packages').select('*').eq('boat_tour_id', boatTourId);
  if (packages.error) throw new Error(packages.error.message);
  const shared = await countSharedTimeSlots();
  const ready: string[] = [];
  const skipped: Array<{ id: string; name: string }> = [];
  for (const row of (packages.data ?? []) as AdminPackageRow[]) {
    if (findPackageIssues(rowFacts(row, shared)).length === 0) ready.push(row.id);
    else skipped.push({ id: row.id, name: row.name });
  }
  if (ready.length) {
    const { error } = await supabase
      .from('tour_packages')
      .update({ active: true, updated_at: new Date().toISOString() })
      .in('id', ready);
    if (error) throw new Error(error.message);
  }
  return { skipped };
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

  const deactivateLink = await supabase
    .from('boat_tours')
    .update({ active: false })
    .eq('id', link.data.id);
  if (deactivateLink.error) throw new Error(deactivateLink.error.message);

  const deactivate = await supabase
    .from('tour_packages')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('boat_tour_id', link.data.id);
  if (deactivate.error) throw new Error(deactivate.error.message);
}
