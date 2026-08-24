import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getPackageLabel, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button, CloseButton, GlassPanel, ModalShell } from '../ui';

interface TourDetailModalProps {
  boat: Boat;
  onClose: () => void;
  onSelect: (tour: BoatTour) => void;
  open: boolean;
  packageTours: BoatTour[];
  tour: BoatTour;
}

export function TourDetailModal({ boat, onClose, onSelect, open, packageTours, tour }: TourDetailModalProps) {
  const { language } = useLanguage();
  const display = getTourText(tour, language);
  const effectiveMaxGuests = getEffectiveMaxGuests(boat, tour);

  return (
    <ModalShell
      className="!max-h-[92dvh] !max-w-2xl overflow-hidden text-white"
      onClose={onClose}
      open={open}
      titleId="tour-detail-title"
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="relative">
          <img src={tour.image} alt={tour.name} className="h-56 w-full object-cover sm:h-64" />
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-950/75 via-ocean-950/20 to-transparent" />
          <CloseButton className="absolute right-4 top-4 z-20" label={language === 'es' ? 'Cerrar detalles del tour' : 'Close tour details'} onClick={onClose} />
          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-ocean-200">{boat.name}</p>
            <h3 id="tour-detail-title" className="mt-1 text-3xl font-extrabold text-white">{display.title}</h3>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <p className="text-base leading-7 text-ocean-200">{tour.description}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Actividades' : 'Activities'}</p>
              <p className="mt-1 font-extrabold text-white">{display.activities.slice(0, 3).join(', ')}</p>
            </GlassPanel>
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Capacidad' : 'Capacity'}</p>
              <p className="mt-1 font-extrabold text-white">{language === 'es' ? `Hasta ${effectiveMaxGuests} personas` : `Up to ${effectiveMaxGuests} guests`}</p>
            </GlassPanel>
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Persona extra' : 'Additional guest'}</p>
              <p className="mt-1 font-extrabold text-ocean-400">{formatCurrency(tour.extraGuestPrice ?? boat.extraGuestPrice)} {language === 'es' ? 'cada una' : 'each'}</p>
            </GlassPanel>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Incluye' : 'Included'}</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ocean-200">
                {display.included.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Precios' : 'Prices'}</p>
              <div className="mt-3 grid gap-2">
                {packageTours.map((item) => (
                  <GlassPanel key={item.id} className="flex justify-between gap-4 px-3 py-2 text-sm" variant="subtle">
                    <span className="font-semibold text-ocean-200">{getPackageLabel(item, language)}</span>
                    <span className="font-extrabold text-ocean-400">{formatCurrency(item.basePrice)}</span>
                  </GlassPanel>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="glass" onClick={onClose}>{language === 'es' ? 'Cerrar' : 'Close'}</Button>
            <Button
              type="button"
              onClick={() => {
                onClose();
                onSelect(tour);
              }}
            >
              {language === 'es' ? 'Reservar' : 'Reserve'}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
