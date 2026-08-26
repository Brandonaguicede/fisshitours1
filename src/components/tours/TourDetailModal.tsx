import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import { getPackageLabel, getTourText } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { Button, CloseButton, GlassPanel, MediaGallery, ModalShell } from '../ui';

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
  const galleryImages = tour.galleryImages?.length ? tour.galleryImages : [{ alt: display.title, src: tour.image }];
  const activities = tour.activities?.length ? tour.activities : display.activities;
  const included = tour.included?.length ? tour.included : display.included;

  return (
    <ModalShell
      className="!max-h-[92dvh] !max-w-2xl overflow-hidden text-white"
      onClose={onClose}
      open={open}
      titleId="tour-detail-title"
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="relative">
          <MediaGallery
            images={galleryImages}
            label={language === 'es' ? `Galería de ${display.title}` : `${display.title} gallery`}
            nextLabel={language === 'es' ? 'Imagen siguiente' : 'Next image'}
            previousLabel={language === 'es' ? 'Imagen anterior' : 'Previous image'}
            unavailableLabel={language === 'es' ? 'Imagen no disponible' : 'Image unavailable'}
          />
          <CloseButton className="absolute right-4 top-4 z-20" label={language === 'es' ? 'Cerrar detalles del tour' : 'Close tour details'} onClick={onClose} />
        </div>

        <div className="p-4 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ocean-300">{boat.name}</p>
            <h3 id="tour-detail-title" className="mt-1 font-display text-3xl font-semibold leading-none text-white sm:text-4xl">{display.title}</h3>
          </div>

          <p className="mt-5 text-base leading-7 text-ocean-200">{tour.shortDescription ?? tour.description}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Actividades' : 'Activities'}</p>
              <p className="mt-1 font-extrabold text-white">{activities.slice(0, 3).join(', ')}</p>
            </GlassPanel>
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Capacidad' : 'Capacity'}</p>
              <p className="mt-1 font-extrabold text-white">{language === 'es' ? `Hasta ${effectiveMaxGuests} personas` : `Up to ${effectiveMaxGuests} guests`}</p>
            </GlassPanel>
            <GlassPanel className="p-4" variant="subtle">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Persona extra' : 'Additional guest'}</p>
              <p className="mt-1 font-extrabold text-ocean-400">{formatCurrency(tour.extraGuestPrice)} {language === 'es' ? 'cada una' : 'each'}</p>
            </GlassPanel>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ocean-400">{language === 'es' ? 'Incluye' : 'Included'}</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ocean-200">
                {included.map((item) => <li key={item}>{item}</li>)}
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
