import { useEffect, useMemo, useRef, useState } from 'react';

import { CarouselArrow } from './CarouselArrow';
import { GalleryPagination } from './GalleryPagination';

export interface MediaGalleryImage {
  alt: string;
  src: string;
}

interface MediaGalleryProps {
  label: string;
  images: MediaGalleryImage[];
  nextLabel: string;
  previousLabel: string;
  unavailableLabel: string;
}

export function MediaGallery({ images, label, nextLabel, previousLabel, unavailableLabel }: MediaGalleryProps) {
  const [page, setPage] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const pageSize = useGalleryPageSize();
  const pageCount = Math.max(1, Math.ceil(images.length / pageSize));
  const visibleImageStart = page * pageSize;
  const visibleImages = images.slice(visibleImageStart, visibleImageStart + pageSize);
  const touchStartX = useRef<number | null>(null);
  const imageKey = useMemo(() => images.map(({ src }) => src).join('|'), [images]);

  useEffect(() => {
    setPage(0);
    setFailedImages(new Set());
  }, [imageKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') setPage((current) => Math.min(current + 1, pageCount - 1));
      if (event.key === 'ArrowLeft') setPage((current) => Math.max(current - 1, 0));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount]);

  return (
    <div
      className="relative isolate overflow-hidden bg-ocean-900/45 p-3 sm:p-4"
      role="region"
      aria-label={label}
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(distance) < 40) return;
        setPage((current) => distance < 0 ? Math.min(current + 1, pageCount - 1) : Math.max(current - 1, 0));
      }}
    >
      <div className="flex justify-center pb-2.5">
        <GalleryPagination currentPage={page} pageSize={pageSize} total={images.length} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleImages.map((image, index) => (
          <div key={image.src} className="h-48 overflow-hidden rounded-2xl border border-white/10 bg-ocean-900/60 shadow-[0_10px_28px_rgba(0,0,0,0.16)] sm:h-52">
            {!failedImages.has(image.src) ? (
              <img
                className="h-full w-full object-cover transition-opacity duration-300"
                src={image.src}
                alt={image.alt}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onError={() => setFailedImages((current) => new Set(current).add(image.src))}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm font-semibold text-ocean-200">{unavailableLabel}</div>
            )}
          </div>
        ))}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-2.5">
          <CarouselArrow direction="left" disabled={page === 0} label={previousLabel} onClick={() => setPage((current) => Math.max(current - 1, 0))} size="sm" />
          <CarouselArrow direction="right" disabled={page === pageCount - 1} label={nextLabel} onClick={() => setPage((current) => Math.min(current + 1, pageCount - 1))} size="sm" />
        </div>
      ) : null}
    </div>
  );
}

function useGalleryPageSize() {
  const [pageSize, setPageSize] = useState(getGalleryPageSize);

  useEffect(() => {
    const updatePageSize = () => setPageSize(getGalleryPageSize());
    window.addEventListener('resize', updatePageSize);
    return () => window.removeEventListener('resize', updatePageSize);
  }, []);

  return pageSize;
}

function getGalleryPageSize() {
  if (typeof window === 'undefined') return 3;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}
