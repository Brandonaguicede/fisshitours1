import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useBookingSelectionContext } from '../contexts/BookingSelectionContext';
import { getActiveBoats } from '../services/boatService';
import { getActiveBoatTours } from '../services/boatTourService';
import type { Boat } from '../types/boat';
import type { BoatTour } from '../types/boatTour';
import { isBookableCatalogPackage } from '../utils/tourCatalog';

const emptyBoats: Boat[] = [];
const emptyTours: BoatTour[] = [];

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
  const catalogBoats = boatsQuery.data ?? emptyBoats;
  const catalogTours = toursQuery.data ?? emptyTours;
  const catalogLoading = boatsQuery.isFetching || toursQuery.isFetching;
  const catalogError = boatsQuery.isError || toursQuery.isError;
  const catalogReady = boatsQuery.isSuccess && toursQuery.isSuccess && !catalogLoading;

  const selectedBoat = useMemo(() => catalogBoats.find((boat) => boat.id === selectedBoatId) ?? catalogBoats[0], [catalogBoats, selectedBoatId]);
  const selectedTour = useMemo(() => catalogTours.find((tour) => tour.id === selectedTourId && tour.boatId === selectedBoat?.id && tour.boatTourId && tour.tourId && isBookableCatalogPackage(tour)), [catalogTours, selectedBoat?.id, selectedTourId]);
  useEffect(() => {
    if (!catalogReady) return;
    if (!catalogBoats.some((boat) => boat.id === selectedBoatId)) {
      setSelectedBoatId(catalogBoats[0]?.id ?? '');
      setSelectedTourId(undefined);
    } else if (selectedTourId && !selectedTour) {
      setSelectedTourId(undefined);
    }
  }, [catalogReady, catalogBoats, selectedBoatId, selectedTourId, selectedTour, setSelectedBoatId, setSelectedTourId]);
  const toursWithKnownBoats = useMemo(() => catalogTours.filter((tour) => catalogBoats.some((boat) => boat.id === tour.boatId)), [catalogBoats, catalogTours]);

  function selectBoat(boat: Boat) {
    if (!catalogReady || !catalogBoats.some((item) => item.id === boat.id)) return;
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
  }

  function selectBoatAndTour(tour: BoatTour) {
    if (!catalogReady || !catalogTours.some((item) => item.id === tour.id && item.boatTourId === tour.boatTourId && item.tourId === tour.tourId && item.boatId === tour.boatId)) return;
    const tourBoat = catalogBoats.find((boat) => boat.id === tour.boatId);
    if (tourBoat) setSelectedBoatId(tourBoat.id);
    setSelectedTourId(tour.id);
  }

  function changeBoat(boat: Boat) {
    if (!catalogReady || !catalogBoats.some((item) => item.id === boat.id)) return;
    setSelectedBoatId(boat.id);
    setSelectedTourId(undefined);
  }

  function changeTour(tour?: BoatTour) {
    if (tour && (!catalogReady || !catalogTours.some((item) => item.id === tour.id && item.boatId === selectedBoat?.id && item.boatTourId === tour.boatTourId && item.tourId === tour.tourId))) return;
    setSelectedTourId(tour?.id);
  }

  return {
    catalogBoats,
    catalogTours,
    toursWithKnownBoats,
    catalogLoading,
    catalogError,
    catalogReady,
    retryCatalog: () => { void boatsQuery.refetch(); void toursQuery.refetch(); },
    selectedBoat,
    selectedTour,
    selectBoat,
    selectBoatAndTour,
    changeBoat,
    changeTour,
  };
}
