import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';
import { isPackageReady, type PackageFacts } from './packageRequirements';

export interface TourBoatOption {
  boat: Boat;
  boatTourId?: string;
  packages: BoatTour[];
}

export interface TourCatalogItem {
  tourId: string;
  /** Used only for tour-level content, never as a global commercial default. */
  tour: BoatTour;
  boatOptions: TourBoatOption[];
  fromPrice: number;
}

// Matches the existing booking flow: a priced package and at least one departure.
// Date-specific availability is still checked by the booking availability API.
// The requirements live in one place (utils/packageRequirements.ts): a package whose duration, departures, price or capacities
// cannot support a booking is never offered, so the customer cannot reach a step that would fail.
export function bookableFacts(item: BoatTour): PackageFacts {
  return {
    name: item.name,
    customQuote: item.customQuote,
    basePrice: item.basePrice,
    includedGuests: item.includedGuests,
    maxGuests: item.maxGuests,
    extraGuestPrice: item.extraGuestPrice,
    durationMinutes: item.duration == null ? null : Math.round(item.duration * 60),
    // `timeSlots` is already resolved (own list, or the shared schedule when the package inherits it).
    departureTimes: item.timeSlots.map((slot) => slot.time),
    sharedTimeCount: 0,
  };
}

export function isBookableCatalogPackage(item: BoatTour) {
  return item.catalogActive !== false && !item.customQuote && isPackageReady(bookableFacts(item));
}

export function groupTourCatalog(packages: BoatTour[], boats: Boat[]): TourCatalogItem[] {
  const boatById = new Map(boats.map((boat) => [boat.id, boat]));
  const groups = new Map<string, TourCatalogItem>();
  for (const item of packages) {
    const boat = boatById.get(item.boatId);
    if (!item.tourId || !boat || !isBookableCatalogPackage(item)) continue;
    let group = groups.get(item.tourId);
    if (!group) {
      group = { tourId: item.tourId, tour: item, boatOptions: [], fromPrice: item.basePrice };
      groups.set(item.tourId, group);
    }
    group.fromPrice = Math.min(group.fromPrice, item.basePrice);
    let option = group.boatOptions.find((entry) => entry.boat.id === item.boatId && entry.boatTourId === item.boatTourId);
    if (!option) {
      option = { boat, boatTourId: item.boatTourId, packages: [] };
      group.boatOptions.push(option);
    }
    if (!option.packages.some((entry) => entry.id === item.id)) option.packages.push(item);
  }
  // `groups` preserves insertion order (first-seen package), which follows
  // `tour_packages.sort_order` — not the tour's own `sort_order` that the
  // Admin's Tours reorder actually writes. Re-sort explicitly by the tour's
  // order so the public catalog matches what Admin persists.
  return [...groups.values()].sort((a, b) => (a.tour.tourSortOrder ?? 0) - (b.tour.tourSortOrder ?? 0));
}
