import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

export function getTourIncludedGuests(boat: Boat, tour?: BoatTour) {
  return tour?.includedGuests ?? boat.includedGuests;
}

export function getEffectiveMaxGuests(boat: Boat, tour?: BoatTour) {
  return Math.min(boat.maxGuests, tour?.maxGuests ?? boat.maxGuests);
}

export function getExtraGuestPrice(boat: Boat, tour?: BoatTour) {
  return tour?.extraGuestPrice ?? boat.extraGuestPrice;
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

  const includedGuests = getTourIncludedGuests(boat, tour);
  const extraGuests = Math.max(guests - includedGuests, 0);
  const extraGuestPrice = getExtraGuestPrice(boat, tour);
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
