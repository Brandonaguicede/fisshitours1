import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useBookingSelectionContext } from '../contexts/BookingSelectionContext';
import { boatTours } from '../data/boatTours';
import { boats } from '../data/boats';
import { getActiveBoats } from '../services/boatService';
import { getActiveBoatTours } from '../services/boatTourService';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';

/**
 * Resolves the shared boat/tour selection (from BookingSelectionContext)
 * against the catalog. Both `queryKey`s match the ones HomePage/ToursPage
 * already used, so React Query serves this from the same cache instead of
 * refetching when the user moves between Home and the dedicated booking
 * route.
 */
export function useBookingCatalog() {
  const { selectedBoatId, selectedTourId, setSelectedBoatId, setSelectedTourId } = useBookingSelectionContext();
  const boatsQuery = useQuery({ queryKey: ['boats', 'active'], queryFn: getActiveBoats });
  const toursQuery = useQuery({ queryKey: ['boatTours', 'active'], queryFn: getActiveBoatTours });
  const catalogBoats = boatsQuery.data?.length ? boatsQuery.data : boats;
  const catalogTours = toursQuery.data?.length ? toursQuery.data : boatTours;
  const catalogLoading = boatsQuery.isLoading || toursQuery.isLoading;

  const selectedBoat = useMemo(() => catalogBoats.find((boat) => boat.id === selectedBoatId) ?? catalogBoats[0], [catalogBoats, selectedBoatId]);
  const selectedTour = useMemo(() => catalogTours.find((tour) => tour.id === selectedTourId && tour.boatId === selectedBoat?.id), [catalogTours, selectedBoat?.id, selectedTourId]);
  const toursWithKnownBoats = useMemo(() => catalogTours.filter((tour) => catalogBoats.some((boat) => boat.id === tour.boatId)), [catalogBoats, catalogTours]);

  function selectBoat(boat: Boat) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(catalogTours.find((tour) => tour.boatId === boat.id)?.id);
  }

  function selectBoatAndTour(tour: BoatTour) {
    const tourBoat = catalogBoats.find((boat) => boat.id === tour.boatId);
    if (tourBoat) setSelectedBoatId(tourBoat.id);
    setSelectedTourId(tour.id);
  }

  function changeBoat(boat: Boat) {
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
  }

  function changeTour(tour?: BoatTour) {
    setSelectedTourId(tour?.id);
  }

  return {
    catalogBoats,
    catalogTours,
    toursWithKnownBoats,
    catalogLoading,
    selectedBoat,
    selectedTour,
    selectBoat,
    selectBoatAndTour,
    changeBoat,
    changeTour,
  };
}
