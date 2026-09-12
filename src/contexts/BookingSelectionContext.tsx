import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { boatTours } from '../data/boatTours';
import { boats } from '../data/boats';

interface BookingSelectionContextValue {
  selectedBoatId: string;
  selectedTourId: string | undefined;
  setSelectedBoatId: (id: string) => void;
  setSelectedTourId: (id: string | undefined) => void;
}

const BookingSelectionContext = createContext<BookingSelectionContextValue | null>(null);

/**
 * The chosen boat/tour is the one piece of booking state that must survive a
 * route change — Home's teaser, the dedicated `/reservar` flow, and the
 * Boat/Tour modals all read and write the same selection here instead of
 * each keeping their own copy. Everything else (step, date, guests, customer
 * details, payment) stays local to `BookingPanel`, which is unaffected.
 */
export function BookingSelectionProvider({ children }: PropsWithChildren) {
  const [selectedBoatId, setSelectedBoatId] = useState(boats[0].id);
  const [selectedTourId, setSelectedTourId] = useState<string | undefined>(boatTours.find((tour) => tour.boatId === boats[0].id)?.id);

  return (
    <BookingSelectionContext.Provider value={{ selectedBoatId, selectedTourId, setSelectedBoatId, setSelectedTourId }}>
      {children}
    </BookingSelectionContext.Provider>
  );
}

export function useBookingSelectionContext() {
  const context = useContext(BookingSelectionContext);
  if (!context) throw new Error('useBookingSelectionContext must be used within a BookingSelectionProvider');
  return context;
}
