export type TourCategory =
  | 'Fishing'
  | 'Snorkeling & Beach'
  | 'Surfing'
  | 'Bioluminescence Basic'
  | 'Bioluminescence Deluxe'
  | 'Water Toys';

export interface TourTimeSlot {
  id: string;
  label: string;
  time: string;
}

export interface BoatTour {
  id: string;
  boatId: string;
  /** Physical capacity of the boat that offers this package. Absolute safety ceiling. */
  boatMaxGuests?: number;
  boatTourId?: string;
  tourId?: string;
  tourTitle?: string;
  /** English translation of `tourTitle`, filled by "Traducir todo el sitio"; falls back to `tourTitle` when missing. */
  tourTitleEn?: string;
  /** The parent tour's own `sort_order` — drives display order in grouped catalogs (one entry per tour, independent of package-level ordering). */
  tourSortOrder?: number;
  /** Shared tour content; commercial fields below still belong to this package. */
  tourDetails?: {
    title: string;
    description: string;
    image: string;
    galleryImages: Array<{ src: string; alt: string }>;
    activities: string[];
  };
  catalogActive?: boolean;
  name: string;
  packageType?: string;
  mealOptions?: Array<{ es: string; en: string }>;
  departureTimes?: string[] | null;
  category: TourCategory;
  description: string;
  /** English translation of `description`, filled by "Traducir todo el sitio"; falls back to `description` when missing. */
  descriptionEn?: string;
  shortDescription?: string;
  /** English translation of `shortDescription`, filled by "Traducir todo el sitio"; falls back to `shortDescription` when missing. */
  shortDescriptionEn?: string;
  activities?: string[];
  /** English translation of `activities` (same order), filled by "Traducir todo el sitio"; falls back to `activities` when missing/shorter. */
  activitiesEn?: string[];
  included?: string[];
  /** English translation of `included` (same order), filled by "Traducir todo el sitio"; falls back to `included` when missing/shorter. */
  includedEn?: string[];
  galleryImages?: Array<{ src: string; alt: string }>;
  duration?: number;
  /** All commercial terms below come from tour_packages — the single source of truth. */
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestPrice: number;
  customQuote: boolean;
  image: string;
  timeSlots: TourTimeSlot[];
}
