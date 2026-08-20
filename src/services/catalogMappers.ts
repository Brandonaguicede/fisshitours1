import type { Boat } from '../types/boat';
import type { BoatTour, TourCategory, TourTimeSlot } from '../types/boatTour';
import type { Tables } from '../types/supabase';

type BoatRow = Tables<'boats'>;
type TourRow = Tables<'tours'>;
type PackageRow = Tables<'tour_packages'>;

export type BoatTourCatalogRow = PackageRow & {
  boat_tours: {
    id: string;
    boat_id: string;
    tour_id: string;
    active: boolean;
    tours: TourRow;
  };
};

export function mapBoat(row: BoatRow): Boat {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.image_url ?? '/images/placeholder-image.jpg',
    images: Array.isArray(row.images) ? row.images.filter((item): item is string => typeof item === 'string') : undefined,
    badge: row.badge ?? undefined,
    basePriceLabel: row.base_price_label ?? 'From $0',
    length: row.length ?? '',
    engine: row.engine ?? '',
    includedGuests: row.included_guests,
    maxGuests: row.max_guests,
    extraGuestPrice: Number(row.extra_guest_price),
    featuredSpec: row.featured_spec ?? '',
    tours: [],
  };
}

export function mapBoatTour(row: BoatTourCatalogRow, timeSlots: TourTimeSlot[]): BoatTour {
  const tour = row.boat_tours.tours;
  return {
    id: row.id,
    boatId: row.boat_tours.boat_id,
    boatTourId: row.boat_tours.id,
    tourId: row.boat_tours.tour_id,
    name: row.name,
    category: normalizeCategory(tour.category, row.name),
    description: row.description ?? '',
    duration: row.duration_minutes ? Math.round(row.duration_minutes / 60) : undefined,
    basePrice: Number(row.base_price),
    includedGuests: row.included_guests,
    maxGuests: row.max_guests,
    extraGuestPrice: Number(row.extra_guest_price),
    customQuote: row.custom_quote,
    image: row.image_url ?? '/images/placeholder-image.jpg',
    timeSlots,
  };
}

function normalizeCategory(category: string, packageName: string): TourCategory {
  if (category === 'Snorkeling & Beach') return 'Snorkeling & Beach';
  if (category === 'Fishing') return 'Fishing';
  if (category === 'Surfing') return 'Surfing';
  if (category === 'Water Toys') return 'Water Toys';
  if (category === 'Bioluminescence') return packageName.toLowerCase().includes('deluxe') ? 'Bioluminescence Deluxe' : 'Bioluminescence Basic';
  return 'Fishing';
}
