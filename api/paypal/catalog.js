export const EXTRA_GUEST_PRICE = 65;
export const INCLUDED_GUESTS = 5;
export const MAX_GUESTS = 10;

export const TOUR_PRICES = {
  'second-wind-beach-snorkeling-half': 650,
  'second-wind-beach-snorkeling-three-quarter': 750,
  'second-wind-beach-snorkeling-full': 950,
  'second-wind-fishing-half': 700,
  'second-wind-fishing-three-quarter': 850,
  'second-wind-fishing-full': 1050,
  'second-wind-surfing-half': 600,
  'second-wind-surfing-three-quarter': 750,
  'second-wind-surfing-full': 950,
  'second-wind-water-toys-half': 750,
  'second-wind-water-toys-three-quarter': 850,
  'second-wind-water-toys-full': 1150,
  'second-wind-bioluminescence-classic': 650,
  'second-wind-bioluminescence-deluxe': 750,
};

export function calculateServerTotal(booking) {
  const tourId = booking?.tour?.id;
  const guests = Number(booking?.guests);
  const basePrice = TOUR_PRICES[tourId];

  if (!basePrice) throw new Error('Invalid tour package.');
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) throw new Error('Invalid guest quantity.');

  const extraGuests = Math.max(0, guests - INCLUDED_GUESTS);
  return basePrice + extraGuests * EXTRA_GUEST_PRICE;
}
