import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { GalleryCategory } from '../../types/gallery';
import { Container } from '../common/Container';
import { Button, FilterMenu, Gallery, GalleryGrid, GalleryImage, GlassPanel, SectionHeader } from '../ui';
import { reveal } from '../common/SectionReveal';
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
    <section className="home-section bg-ocean-950 pb-10 pt-0 sm:pb-12 sm:pt-6 lg:pb-14 lg:pt-8" data-home-section data-nav-href="/#gallery" id="gallery">
      <Container>
        <div data-nav-frame>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between" {...reveal(0)}>
          <SectionHeader
            align="left"
            eyebrow={tr(text.home.galleryEyebrow, language)}
            title={tr(text.home.galleryTitle, language)}
            description={tr(text.home.galleryDescription, language)}
          />
          <FilterMenu
            label={language === 'es' ? 'Filtrar' : 'Filter'}
            ariaLabel={language === 'es' ? 'Filtrar galería por categoría' : 'Filter gallery by category'}
            clearLabel={language === 'es' ? 'Ver todo' : 'Clear filter'}
            clearValue="all"
            value={activeFilter}
            onChange={(next) => changeFilter(next as GalleryCategory | 'all')}
            options={filters.map((filter) => ({ value: filter.value, label: filter.label[language] }))}
          />
        </div>

        <Gallery closeLabel={language === 'es' ? 'Cerrar galería' : 'Close gallery'}>
          <GalleryGrid className="mt-7" {...reveal(1)}>
            {visibleImages.map((image) => (
              <GalleryImage
                key={image.id}
                id={String(image.id)}
                src={image.src}
                alt={image.alt ?? (language === 'es' ? 'Imagen de la galería' : 'Gallery image')}
              />
            ))}
          </GalleryGrid>

          {!galleryQuery.isLoading && visibleImages.length === 0 ? (
            <GlassPanel className="mt-10 rounded-3xl p-8 text-center text-ocean-200" variant="subtle">
              {language === 'es' ? 'La galeria se esta actualizando. Vuelve pronto para ver nuevas imagenes.' : 'The gallery is being updated. Check back soon for new images.'}
            </GlassPanel>
          ) : null}

          {hasMore ? (
            <div className="mt-8 text-center">
              <Button variant="glass" type="button" onClick={() => setVisibleCount((count) => count + 4)}>
                {language === 'es' ? 'Ver más' : 'View More'}
              </Button>
            </div>
          ) : null}
        </Gallery>
        </div>
      </Container>
    </section>
  );
}
