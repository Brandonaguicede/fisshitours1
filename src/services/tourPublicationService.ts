import { supabase } from '../lib/supabase';
import { isSellablePackage, packageRowFacts, type PackageRowLike } from '../utils/packageRequirements';

// Publication rule for tours (Admin side):
//   a tour needs at least one SELLABLE package to be published.
// "Sellable" is the same condition the public catalog uses (isSellablePackage): package active, tour <-> boat link active, boat active, not a custom
// quote and complete (name, duration, hours, price, guests...). A tour that has none is a draft, so Admin never says "Activo" while the public site hides it.
//   - it loses its last sellable package while published  -> it goes back to draft automatically (demoteUnsellablePublishedTours);
//   - it gets a sellable package again                    -> it STAYS draft; a person decides to publish it (isTourPublishable only makes it eligible).

export interface DemotedTour {
  id: string;
  title: string;
}

export const TOUR_SAVED_AS_DRAFT_NOTICE = 'El tour se guardó como borrador porque todavía no tiene paquetes activos disponibles. Agrega o activa al menos un paquete para poder publicarlo.';
export const TOUR_CANNOT_PUBLISH_NOTICE = 'No se puede publicar este tour porque todavía no tiene paquetes activos disponibles. Agrega o activa al menos un paquete y vuelve a publicarlo.';
export const TOUR_PUBLICATION_REQUIREMENT = 'Para publicar este tour debe existir al menos un paquete activo. Si no hay paquetes registrados o todos están inactivos, el tour se guardará como borrador y no aparecerá en el sitio público.';
export const TOUR_PUBLISHABLE_NOTICE = 'Este tour cumple los requisitos para publicarse.';

type PackageChainRow = PackageRowLike & { active: boolean; boat_tours: { tour_id: string; active: boolean; boats: { active: boolean } | null } | null };

/** Ids of the tours that have at least one sellable package (whatever the tour's own status is). */
export async function loadSellableTourIds(): Promise<Set<string>> {
  const [packages, shared] = await Promise.all([
    supabase.from('tour_packages').select('*, boat_tours!inner(tour_id, active, boats!inner(active))'),
    supabase.from('time_slots').select('id', { count: 'exact', head: true }).eq('active', true).eq('is_general', true),
  ]);
  if (packages.error) throw new Error(packages.error.message);
  if (shared.error) throw new Error(shared.error.message);
  const sharedTimeCount = shared.count ?? 0;
  const sellable = new Set<string>();
  for (const row of (packages.data ?? []) as unknown as PackageChainRow[]) {
    const link = row.boat_tours;
    if (!link) continue;
    const chainActive = Boolean(row.active && link.active && link.boats?.active);
    if (isSellablePackage(chainActive, packageRowFacts(row, row.departure_times == null ? sharedTimeCount : 0))) sellable.add(link.tour_id);
  }
  return sellable;
}

export async function isTourPublishable(tourId: string): Promise<boolean> {
  return (await loadSellableTourIds()).has(tourId);
}

/**
 * Every published tour without a sellable package goes back to draft (the database turns `active` off with it). Idempotent and cheap: call it after
 * any change that can remove a tour's last sellable package. It never publishes anything. sort_order is not touched, so the remaining tours keep their order.
 */
export async function demoteUnsellablePublishedTours(): Promise<DemotedTour[]> {
  const [sellable, published] = await Promise.all([
    loadSellableTourIds(),
    supabase.from('tours').select('id, title').eq('publication_status', 'published'),
  ]);
  if (published.error) throw new Error(published.error.message);
  const lost = (published.data ?? []).filter((tour) => !sellable.has(tour.id));
  if (!lost.length) return [];
  const { error } = await supabase.from('tours').update({ publication_status: 'draft', updated_at: new Date().toISOString() }).in('id', lost.map((tour) => tour.id));
  if (error) throw new Error(error.message);
  return lost;
}

/** Sentence for the Admin feedback after a change demoted tours; '' when nothing changed. */
export function describeDemotedTours(demoted: DemotedTour[]): string {
  if (!demoted.length) return '';
  const names = demoted.map((tour) => `"${tour.title}"`).join(', ');
  return demoted.length === 1
    ? `El tour ${names} pasó a borrador porque ya no tiene paquetes activos disponibles.`
    : `Los tours ${names} pasaron a borrador porque ya no tienen paquetes activos disponibles.`;
}
