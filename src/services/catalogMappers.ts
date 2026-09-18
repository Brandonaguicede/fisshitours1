import type { Boat } from '../types/boat';
import type { BoatTour, TourCategory, TourTimeSlot } from '../types/boatTour';
import { parseMealOptions } from '../utils/packageSettings';
import type { Tables } from '../types/supabase';

type BoatRow = Tables<'boats'>;
type TourRow = Tables<'tours'>;
type PackageRow = Tables<'tour_packages'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;

export type BoatTourCatalogRow = PackageRow & {
  boat_tours: {
    id: string;
    boat_id: string;
    tour_id: string;
    active: boolean;
    boats: Pick<BoatRow, 'active' | 'max_guests'>;
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
    length: row.length ?? '',
    engine: row.engine ?? '',
    maxGuests: row.max_guests,
    featuredSpec: row.featured_spec ?? '',
    tours: [],
  };
}

export function mapBoatTour(
  row: BoatTourCatalogRow,
  timeSlots: TourTimeSlot[],
  images: TourImageRow[] = [],
  inclusions: TourInclusionRow[] = [],
): BoatTour {
  const tour = row.boat_tours.tours;
  const galleryImages = images
    .filter((image) => image.tour_id === tour.id && image.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => ({ src: image.image_url, alt: image.alt_text || tour.title }));
  const activeInclusions = inclusions
    .filter((item) => item.tour_id === tour.id && item.active && (item.tour_package_id === null || item.tour_package_id === row.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.label);
  const legacyIncluded = Array.isArray(tour.included) ? tour.included.filter((item): item is string => typeof item === 'string') : [];
  const activities = Array.isArray(tour.highlights) ? tour.highlights.filter((item): item is string => typeof item === 'string') : [];
  const primaryImage = galleryImages.find((image) => image.src === tour.image_url) ?? galleryImages[0];
  return {
    id: row.id,
    boatId: row.boat_tours.boat_id,
    boatMaxGuests: row.boat_tours.boats?.max_guests,
    boatTourId: row.boat_tours.id,
    tourId: row.boat_tours.tour_id,
    tourTitle: tour.title,
    tourSortOrder: tour.sort_order,
    tourDetails: {
      title: tour.title,
      description: tour.description ?? '',
      image: tour.image_url ?? primaryImage?.src ?? '/images/placeholder-image.jpg',
      galleryImages,
      activities,
    },
    catalogActive: row.active && row.boat_tours.active && row.boat_tours.boats.active && tour.active,
    name: row.name,
    packageType: row.package_type,
    departureTimes: row.departure_times,
    mealOptions: parseMealOptions(row.meal_options),
    category: normalizeCategory(tour.category, row.name),
    description: row.description ?? tour.description ?? '',
    shortDescription: tour.description ?? row.description ?? '',
    activities,
    included: row.package_included ?? (activeInclusions.length > 0 ? activeInclusions : legacyIncluded),
    galleryImages: primaryImage
      ? [primaryImage, ...galleryImages.filter((image) => image.src !== primaryImage.src)]
      : undefined,
    duration: row.duration_minutes ? row.duration_minutes / 60 : undefined,
    basePrice: row.base_price == null ? Number.NaN : Number(row.base_price),
    includedGuests: row.included_guests,
    maxGuests: row.max_guests,
    extraGuestPrice: Number(row.extra_guest_price),
    customQuote: row.custom_quote,
    image: row.image_url ?? tour.image_url ?? primaryImage?.src ?? '/images/placeholder-image.jpg',
    timeSlots: row.departure_times == null ? timeSlots : timeSlots.filter((slot) => row.departure_times?.includes(slot.time)),
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
