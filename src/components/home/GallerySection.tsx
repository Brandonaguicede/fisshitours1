import { useMemo, useState } from 'react';

import { galleryImages } from '../../data/gallery';
import type { GalleryCategory } from '../../types/gallery';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';

const filters: Array<{ label: string; value: GalleryCategory | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Fishing', value: 'fishing' },
  { label: 'Boats', value: 'boats' },
  { label: 'Beach', value: 'beach' },
  { label: 'Snorkeling', value: 'snorkeling' },
  { label: 'Wildlife', value: 'wildlife' },
  { label: 'Sunsets', value: 'sunsets' },
  { label: 'Experiences', value: 'experiences' },
];

export function GallerySection() {
  const { language } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<GalleryCategory | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(8);

  const filteredImages = useMemo(
    () => (activeFilter === 'all' ? galleryImages : galleryImages.filter((image) => image.category === activeFilter)),
    [activeFilter],
  );

  const visibleImages = filteredImages.slice(0, visibleCount);
  const hasMore = visibleCount < filteredImages.length;

  function changeFilter(nextFilter: GalleryCategory | 'all') {
    setActiveFilter(nextFilter);
    setVisibleCount(8);
  }

  return (
    <section className="section-y scroll-mt-24 bg-ocean-950" id="gallery">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionTitle
            align="left"
            eyebrow={tr(text.home.galleryEyebrow, language)}
            title={tr(text.home.galleryTitle, language)}
            description={tr(text.home.galleryDescription, language)}
          />
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={cn(
                  'focus-ring pressable rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-ocean-100 transition-all duration-300 hover:border-ocean-400 hover:text-ocean-300',
                  activeFilter === filter.value && 'border-ocean-400 bg-ocean-500 text-ocean-950 hover:text-ocean-950',
                )}
                type="button"
                onClick={() => changeFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleImages.map((image) => (
            <figure key={image.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-soft">
              <img className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105" src={image.src} alt={image.alt} loading="lazy" />
            </figure>
          ))}
        </div>

        {hasMore ? (
          <div className="mt-8 text-center">
            <Button variant="secondary" type="button" onClick={() => setVisibleCount((count) => count + 4)}>
              {language === 'es' ? 'Ver más' : 'View More'}
            </Button>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
