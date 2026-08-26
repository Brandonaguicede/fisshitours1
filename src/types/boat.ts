export interface Boat {
  id: string;
  slug: string;
  name: string;
  image: string;
  images?: string[];
  badge?: string;
  length: string;
  engine: string;
  /** Physical capacity of the boat. Not a pricing default — see tour_packages for commercial terms. */
  maxGuests: number;
  featuredSpec: string;
  tours: string[];
}
