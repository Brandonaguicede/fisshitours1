export interface Boat {
  id: string;
  slug: string;
  name: string;
  image: string;
  images?: string[];
  badge?: string;
  /** English translation of `badge`, filled by "Traducir todo el sitio"; falls back to `badge` when missing. */
  badgeEn?: string;
  length: string;
  engine: string;
  /** Physical capacity of the boat. Not a pricing default — see tour_packages for commercial terms. */
  maxGuests: number;
  featuredSpec: string;
  /** English translation of `featuredSpec`, filled by "Traducir todo el sitio"; falls back to `featuredSpec` when missing. */
  featuredSpecEn?: string;
  tours: string[];
}
