import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

const DEFAULT_INCLUDED_GUESTS = 1;
const DEFAULT_EXTRA_GUEST_PRICE = 0;

// tour_packages (represented here as BoatTour) is the single source of truth for
// included guests, extra guest price and base price. `boat.maxGuests` is the boat's
// physical capacity and is only ever used as a safety ceiling, never as a price default.
export function getTourIncludedGuests(_boat: Boat, tour?: BoatTour) {
  return tour?.includedGuests ?? DEFAULT_INCLUDED_GUESTS;
}

export function getEffectiveMaxGuests(boat: Boat, tour?: BoatTour) {
  return Math.min(boat.maxGuests, tour?.maxGuests ?? boat.maxGuests);
}

export function getExtraGuestPrice(_boat: Boat, tour?: BoatTour) {
  return tour?.extraGuestPrice ?? DEFAULT_EXTRA_GUEST_PRICE;
}

export function getBoatStartingPrice(boatId: string, tours: BoatTour[]) {
  const prices = tours.filter((tour) => tour.boatId === boatId && !tour.customQuote).map((tour) => tour.basePrice);
  return prices.length ? Math.min(...prices) : 0;
}

export function calculateBookingTotal(boat: Boat, tour: BoatTour | undefined, guests: number) {
  if (!tour || tour.customQuote) {
    return {
      isCustomQuote: true,
      basePrice: 0,
      includedGuests: getTourIncludedGuests(boat, tour),
      extraGuests: 0,
      extraGuestPrice: getExtraGuestPrice(boat, tour),
      extraGuestsTotal: 0,
      extrasTotal: 0,
      total: 0,
    };
  }

  const includedGuests = tour.includedGuests;
  const extraGuests = Math.max(guests - includedGuests, 0);
  const extraGuestPrice = tour.extraGuestPrice;
  const extraGuestsTotal = extraGuests * extraGuestPrice;

  return {
    isCustomQuote: false,
    basePrice: tour.basePrice,
    includedGuests,
    extraGuests,
    extraGuestPrice,
    extraGuestsTotal,
    extrasTotal: 0,
    total: tour.basePrice + extraGuestsTotal,
  };
}
