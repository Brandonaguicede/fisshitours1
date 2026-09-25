import type { Boat, BoatEquipmentItem } from '../types/boat';
import type { BoatTour, TourCategory, TourTimeSlot } from '../types/boatTour';
import { parseMealOptions } from '../utils/packageSettings';
import type { Tables } from '../types/supabase';

type BoatRow = Tables<'boats'>;
type TourRow = Tables<'tours'>;
type PackageRow = Tables<'tour_packages'>;
type TourImageRow = Tables<'tour_images'>;
type TourInclusionRow = Tables<'tour_inclusions'>;
type BoatEquipmentRow = Tables<'boat_equipment'>;

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

export function mapBoat(row: BoatRow, equipment: BoatEquipmentRow[] = []): Boat {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.image_url ?? '/images/placeholder-image.jpg',
    images: Array.isArray(row.images) ? row.images.filter((item): item is string => typeof item === 'string') : undefined,
    badge: row.badge ?? undefined,
    badgeEs: row.badge_es ?? undefined,
    badgeEn: row.badge_en ?? undefined,
    length: row.length ?? '',
    engine: row.engine ?? '',
    maxGuests: row.max_guests,
    featuredSpec: row.featured_spec ?? '',
    featuredSpecEs: row.featured_spec_es ?? undefined,
    featuredSpecEn: row.featured_spec_en ?? undefined,
    equipment: equipment
      .filter((item) => item.boat_id === row.id && item.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item): BoatEquipmentItem => ({
        id: item.id,
        label: item.label,
        labelEs: item.label_es ?? undefined,
        labelEn: item.label_en ?? undefined,
      })),
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
    .map((image) => ({
      src: image.image_url,
      alt: image.alt_text || tour.title,
      altEs: image.alt_text_es || tour.title_es || undefined,
      altEn: image.alt_text_en || tour.title_en || undefined,
    }));
  const activeInclusions = inclusions
    .filter((item) => item.tour_id === tour.id && item.active && (item.tour_package_id === null || item.tour_package_id === row.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.label);
  const activeInclusionsEs = inclusions
    .filter((item) => item.tour_id === tour.id && item.active && (item.tour_package_id === null || item.tour_package_id === row.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.label_es || item.label);
  const activeInclusionsEn = inclusions
    .filter((item) => item.tour_id === tour.id && item.active && (item.tour_package_id === null || item.tour_package_id === row.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.label_en || item.label);
  const legacyIncluded = Array.isArray(tour.included) ? tour.included.filter((item): item is string => typeof item === 'string') : [];
  const legacyIncludedEs = Array.isArray(tour.included_es) ? tour.included_es.filter((item): item is string => typeof item === 'string') : [];
  const legacyIncludedEn = Array.isArray(tour.included_en) ? tour.included_en.filter((item): item is string => typeof item === 'string') : [];
  const activities = Array.isArray(tour.highlights) ? tour.highlights.filter((item): item is string => typeof item === 'string') : [];
  const activitiesEs = Array.isArray(tour.highlights_es) ? tour.highlights_es.filter((item): item is string => typeof item === 'string') : [];
  const activitiesEn = Array.isArray(tour.highlights_en) ? tour.highlights_en.filter((item): item is string => typeof item === 'string') : [];
  const primaryImage = galleryImages.find((image) => image.src === tour.image_url) ?? galleryImages[0];
  return {
    id: row.id,
    boatId: row.boat_tours.boat_id,
    boatMaxGuests: row.boat_tours.boats?.max_guests,
    boatTourId: row.boat_tours.id,
    tourId: row.boat_tours.tour_id,
    tourTitle: tour.title,
    tourTitleEs: tour.title_es ?? undefined,
    tourTitleEn: tour.title_en ?? undefined,
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
    nameEs: row.name_es ?? undefined,
    nameEn: row.name_en ?? undefined,
    packageType: row.package_type,
    departureTimes: row.departure_times,
    mealOptions: parseMealOptions(row.meal_options),
    category: normalizeCategory(tour.category, row.name),
    description: row.description ?? tour.description ?? '',
    descriptionEs: row.description_es ?? tour.description_es ?? undefined,
    descriptionEn: row.description_en ?? tour.description_en ?? undefined,
    shortDescription: tour.description ?? row.description ?? '',
    shortDescriptionEs: tour.description_es ?? row.description_es ?? undefined,
    shortDescriptionEn: tour.description_en ?? row.description_en ?? undefined,
    activities,
    activitiesEs,
    activitiesEn,
    included: row.package_included ?? (activeInclusions.length > 0 ? activeInclusions : legacyIncluded),
    // A package with its own list (package_included not null, even []) shows ITS Spanish/English copies; while
    // a copy is still missing (older or not-yet-translated records) it is left undefined so the language
    // picker falls back to `included` — never to the tour's list, and never to a stale copy of another list.
    // A package that inherits (package_included null) uses the tour's lists and ignores its own _es/_en.
    includedEs: row.package_included != null ? row.package_included_es ?? undefined : activeInclusionsEs.length > 0 ? activeInclusionsEs : legacyIncludedEs,
    includedEn: row.package_included != null ? row.package_included_en ?? undefined : activeInclusionsEn.length > 0 ? activeInclusionsEn : legacyIncludedEn,
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
