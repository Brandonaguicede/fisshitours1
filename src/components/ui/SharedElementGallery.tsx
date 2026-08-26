import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren, type MouseEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '../../utils/cn';
import { CloseButton } from './CloseButton';
import { ModalShell } from './ModalShell';

const spring = {
  type: 'spring',
  stiffness: 350,
  damping: 35,
  mass: 1,
} as const;

interface GalleryImage {
  id: string;
  src: string;
  alt: string;
}

interface GalleryContextType {
  selectedImage: GalleryImage | null;
  setSelectedImage: (image: GalleryImage | null) => void;
}

const GalleryContext = createContext<GalleryContextType | null>(null);

function useGalleryContext() {
  const context = useContext(GalleryContext);
  if (!context) throw new Error('Gallery components must be used within a Gallery');
  return context;
}

interface GalleryProps extends PropsWithChildren {
  closeLabel?: string;
}

export function Gallery({ children, closeLabel = 'Close gallery' }: GalleryProps) {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const contextValue = useMemo(() => ({ selectedImage, setSelectedImage }), [selectedImage]);

  return (
    <GalleryContext.Provider value={contextValue}>
      {children}
      <GalleryLightbox closeLabel={closeLabel} />
    </GalleryContext.Provider>
  );
}

export function GalleryGrid({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('columns-1 gap-4 sm:columns-2 lg:columns-4', className)}>{children}</div>;
}

interface GalleryImageProps {
  alt: string;
  className?: string;
  id: string;
  src: string;
}

export function GalleryImage({ alt, className, id, src }: GalleryImageProps) {
  const { setSelectedImage } = useGalleryContext();
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      className={cn('mb-4 block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-white/10 bg-ocean-900/60 shadow-soft', className)}
      aria-label={alt}
      whileHover={reduceMotion ? undefined : 'hover'}
      whileTap={reduceMotion ? undefined : 'tap'}
      onClick={() => setSelectedImage({ id, src, alt })}
    >
      <motion.img
        layoutId={`gallery-image-${id}`}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="w-full rounded-2xl object-cover"
        variants={{ hover: { scale: 0.98 }, tap: { scale: 0.95 } }}
        transition={spring}
      />
    </motion.button>
  );
}

function GalleryLightbox({ closeLabel }: { closeLabel: string }) {
  const { selectedImage, setSelectedImage } = useGalleryContext();
  const reduceMotion = useReducedMotion();
  const lastDragEndRef = useRef(0);

  const close = useCallback(() => setSelectedImage(null), [setSelectedImage]);

  function handleDragEnd(info: { offset: { y: number }; velocity: { y: number } }) {
    lastDragEndRef.current = Date.now();
    if (Math.abs(info.offset.y) > 100 || Math.abs(info.velocity.y) > 300) {
      setSelectedImage(null);
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (Date.now() - lastDragEndRef.current < 150) return;
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    setSelectedImage(null);
  }

  return (
    <ModalShell
      open={Boolean(selectedImage)}
      onClose={close}
      titleId="gallery-lightbox-title"
      className="!max-w-none !overflow-visible !bg-transparent !shadow-none"
    >
      {selectedImage ? (
        <div className="relative flex w-full items-center justify-center">
          <span id="gallery-lightbox-title" className="sr-only">{selectedImage.alt}</span>
          <motion.div
            className="flex w-full cursor-zoom-out items-center justify-center py-10"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.8}
            onDragEnd={(event, info) => handleDragEnd(info)}
            onClick={handleClick}
          >
            <motion.img
              layoutId={`gallery-image-${selectedImage.id}`}
              src={selectedImage.src}
              alt={selectedImage.alt}
              draggable={false}
              decoding="async"
              className="pointer-events-none max-h-[85dvh] w-auto max-w-full select-none rounded-2xl border border-white/10 shadow-lifted object-contain"
              transition={reduceMotion ? { duration: 0 } : spring}
            />
          </motion.div>
          <CloseButton className="absolute right-4 top-4 z-20" label={closeLabel} onClick={close} />
        </div>
      ) : null}
    </ModalShell>
  );
}
