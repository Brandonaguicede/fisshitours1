import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { GalleryCategory } from '../../types/gallery';
import { cn } from '../../utils/cn';
import { Button } from '../common/Button';
import { Container } from '../common/Container';
import { SectionTitle } from '../common/SectionTitle';
import { useLanguage } from '../../i18n/LanguageContext';
import { text, tr } from '../../i18n/translations';
import { supabase } from '../../lib/supabase';

const filters: Array<{ label: { es: string; en: string }; value: GalleryCategory | 'all' }> = [
  { label: { es: 'Todo', en: 'All' }, value: 'all' },
  { label: { es: 'Pesca', en: 'Fishing' }, value: 'fishing' },
  { label: { es: 'Barcos', en: 'Boats' }, value: 'boats' },
  { label: { es: 'Playa', en: 'Beach' }, value: 'beach' },
  { label: { es: 'Fauna', en: 'Wildlife' }, value: 'wildlife' },
  { label: { es: 'Experiencias', en: 'Experiences' }, value: 'experiences' },
];

export function GallerySection() {
  const { language } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<GalleryCategory | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(8);
  const galleryQuery = useQuery({
    queryKey: ['gallery-images', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('id, src, image_url, alt, category')
        .eq('active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []).map((image) => ({
        id: image.id,
        src: image.src ?? image.image_url ?? '/images/placeholder-image.jpg',
        alt: image.alt,
        category: image.category as GalleryCategory,
      }));
    },
  });

  const sourceImages = galleryQuery.data ?? [];

  const filteredImages = useMemo(
    () => (activeFilter === 'all' ? sourceImages : sourceImages.filter((image) => image.category === activeFilter)),
    [activeFilter, sourceImages],
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
              {filter.label[language]}
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

        {!galleryQuery.isLoading && visibleImages.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center text-ocean-200">
            {language === 'es' ? 'La galeria se esta actualizando. Vuelve pronto para ver nuevas imagenes.' : 'The gallery is being updated. Check back soon for new images.'}
          </div>
        ) : null}

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
