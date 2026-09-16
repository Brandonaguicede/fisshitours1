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
  shortDescription?: string;
  activities?: string[];
  included?: string[];
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
