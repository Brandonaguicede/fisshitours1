import { useState } from 'react';
import type { Boat } from '../../types/boat';
import type { BoatTour } from '../../types/boatTour';
import type { TourBoatOption } from '../../utils/tourCatalog';
import { isBookableCatalogPackage } from '../../utils/tourCatalog';
import { getPackageLabel, getTourText, pick } from '../../i18n/content';
import { useLanguage } from '../../i18n/LanguageContext';
import { getEffectiveMaxGuests } from '../../utils/bookingPricing';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatTime } from '../../utils/format';
import { Button, ChoiceCard, CloseButton, GlassPanel, MediaGallery, ModalShell } from '../ui';

interface TourDetailModalProps {
  boat: Boat;
  boatOptions?: TourBoatOption[];
  onClose: () => void;
  onSelect: (tour: BoatTour) => void;
  open: boolean;
  packageTours: BoatTour[];
  tour: BoatTour;
}

export function TourDetailModal({ boat, boatOptions, onClose, onSelect, open, packageTours, tour }: TourDetailModalProps) {
  const { language } = useLanguage();
  const options = boatOptions ?? [{ boat, boatTourId: tour.boatTourId, packages: packageTours }];
  const [selection, setSelection] = useState<{ boatId: string; boatTourId?: string; packageId?: string }>(() => {
    const only = options.length === 1 ? options[0] : undefined;
    return { boatId: only?.boat.id ?? '', boatTourId: only?.boatTourId,
      packageId: boatOptions ? undefined : only?.packages.find((item) => item.id === tour.id && isBookableCatalogPackage(item))?.id };
  });
  const selectedOption = options.find((option) => option.boat.id === selection.boatId && option.boatTourId === selection.boatTourId);
  // Match all original identities, so a changed parent can never retain another boat's package.
  const selectedPackage = selectedOption?.packages.find((item) => item.id === selection.packageId
    && item.boatId === selectedOption.boat.id && item.boatTourId === selectedOption.boatTourId
    && item.tourId === tour.tourId && isBookableCatalogPackage(item));
  const display = getTourText(tour, language);
  const selectedDisplay = selectedPackage ? getTourText(selectedPackage, language) : null;
  const rawGalleryImages = tour.tourDetails?.galleryImages.length ? tour.tourDetails.galleryImages
    : tour.galleryImages?.length ? tour.galleryImages : [{ alt: display.title, src: tour.tourDetails?.image ?? tour.image }];
  const galleryImages = rawGalleryImages.map((image) => ({ ...image, alt: pick(language, image.altEs, image.alt, image.altEn) }));
  const activities = selectedDisplay?.activities ?? display.activities;
  const included = selectedDisplay?.included ?? [];

  return (
    <ModalShell className="!max-h-[92dvh] !max-w-2xl overflow-hidden text-white" onClose={onClose} open={open} titleId="tour-detail-title">
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="relative">
          <MediaGallery images={galleryImages} label={display.title}
            nextLabel={language === 'es' ? 'Imagen siguiente' : 'Next image'}
            previousLabel={language === 'es' ? 'Imagen anterior' : 'Previous image'}
            unavailableLabel={language === 'es' ? 'Imagen no disponible' : 'Image unavailable'} />
          <CloseButton className="absolute right-4 top-4 z-20" label={language === 'es' ? 'Cerrar detalles del tour' : 'Close tour details'} onClick={onClose} />
        </div>
        <div className="p-4 sm:p-5">
          <h3 id="tour-detail-title" className="font-display text-2xl font-semibold leading-none text-white sm:text-3xl">{display.title}</h3>
          <p className="mt-4 text-sm leading-6 text-ocean-200">{display.description || display.shortDescription}</p>

          {options.length > 1 ? <fieldset className="mt-4">
            <legend className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Elige tu bote' : 'Choose your boat'}</legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {options.map((option) => <ChoiceCard key={option.boatTourId ?? option.boat.id}
                className="flex items-center gap-3 p-3 text-left"
                selected={selectedOption === option}
                onClick={() => setSelection({ boatId: option.boat.id, boatTourId: option.boatTourId })}>
                <img className="h-16 w-16 shrink-0 rounded-lg object-cover" src={option.boat.image} alt={option.boat.name} />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-white">{option.boat.name}</span>
                  <span className="block text-xs text-ocean-200">{language === 'es' ? 'Capacidad del bote: ' : 'Boat capacity: '}{option.boat.maxGuests}</span>
                </span>
              </ChoiceCard>)}
            </div>
          </fieldset> : selectedOption ? <p className="mt-4 text-sm font-bold text-ocean-200">{selectedOption.boat.name}</p> : null}

          {selectedOption ? <fieldset className="mt-4">
            <legend className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Elige tu paquete' : 'Choose your package'}</legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {selectedOption.packages.filter((item) => item.boatId === selectedOption.boat.id
                && item.boatTourId === selectedOption.boatTourId && item.tourId === tour.tourId
                && isBookableCatalogPackage(item)).map((item) => <ChoiceCard key={item.id}
                  className="flex justify-between gap-3 px-3 py-2 text-left"
                  selected={selectedPackage?.id === item.id}
                  onClick={() => setSelection({ boatId: selectedOption.boat.id, boatTourId: selectedOption.boatTourId, packageId: item.id })}>
                  <span className="text-sm font-semibold text-ocean-200">{getPackageLabel(item, language)}</span>
                  <span className="text-sm font-extrabold text-ocean-400">{formatCurrency(item.basePrice)}</span>
                </ChoiceCard>)}
            </div>
          </fieldset> : null}

          {selectedPackage && selectedOption ? <div className="mt-4" aria-live="polite" data-testid="selected-package-details">
            {selectedDisplay?.description ? <p className="text-sm leading-6 text-ocean-200">{selectedDisplay.description}</p> : null}
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              <GlassPanel className="p-3" variant="subtle">
                <p className="text-xs font-bold text-ocean-400">{language === 'es' ? 'Duración' : 'Duration'}</p>
                <p className="mt-1 text-sm font-extrabold text-white">{selectedPackage.duration ? selectedPackage.duration + (language === 'es' ? ' horas' : ' hours') : (language === 'es' ? 'Consultar' : 'On request')}</p>
              </GlassPanel>
              <GlassPanel className="p-3" variant="subtle">
                <p className="text-xs font-bold text-ocean-400">{language === 'es' ? 'Capacidad del paquete' : 'Package capacity'}</p>
                <p className="mt-1 text-sm font-extrabold text-white">{getEffectiveMaxGuests(selectedOption.boat, selectedPackage)} {language === 'es' ? 'personas' : 'guests'}</p>
                <p className="mt-1 text-xs text-ocean-200">{selectedPackage.includedGuests} {language === 'es' ? 'incluidas' : 'included'}</p>
              </GlassPanel>
              <GlassPanel className="p-3" variant="subtle">
                <p className="text-xs font-bold text-ocean-400">{language === 'es' ? 'Persona extra' : 'Additional guest'}</p>
                <p className="mt-1 text-sm font-extrabold text-white">{formatCurrency(selectedPackage.extraGuestPrice)}</p>
              </GlassPanel>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Incluye' : 'Included'}</p>
                <ul className="mt-2 grid gap-1 text-sm leading-6 text-ocean-200">{included.map((item) => <li key={item}>{item}</li>)}</ul>
                {activities.length ? <p className="mt-3 text-sm text-ocean-200">{activities.join(', ')}</p> : null}
              </div>
              <div>
                <p className="text-sm font-bold text-ocean-100">{language === 'es' ? 'Horarios de salida' : 'Departure times'}</p>
                <p className="mt-2 text-sm text-ocean-200">{selectedPackage.timeSlots.map((slot) => formatTime(slot.time)).join(', ')}</p>
                {selectedPackage.mealOptions?.length ? <>
                  <p className="mt-3 text-sm font-bold text-ocean-100">{language === 'es' ? 'Comidas incluidas disponibles' : 'Included meal options'}</p>
                  <ul className="mt-2 text-sm text-ocean-200">{selectedPackage.mealOptions.map((meal) => <li key={meal.en}>{meal[language]}</li>)}</ul>
                </> : null}
              </div>
            </div>
          </div> : null}
          {!options.length ? <p className="mt-4 text-sm text-ocean-200">{language === 'es' ? 'No hay paquetes disponibles.' : 'No packages available.'}</p> : null}

        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-white/10 p-4 sm:p-5">
        <Button type="button" fullWidth className="sm:w-auto sm:min-w-[170px]" disabled={!selectedPackage}
          onClick={() => { if (!selectedPackage) return; onClose(); onSelect(selectedPackage); }}>
          {language === 'es' ? 'Reservar' : 'Reserve'}
        </Button>
      </div>
    </ModalShell>
  );
}
