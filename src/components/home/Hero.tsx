import { ArrowDown, Facebook, Instagram } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Container } from '../common/Container';
import { Button, IconButton } from '../ui';
import { FACEBOOK_URL, INSTAGRAM_URL, WHATSAPP_NUMBER } from '../../constants/contact';
import { useLanguage } from '../../i18n/LanguageContext';
import { supabase } from '../../lib/supabase';
import { scrollToHomeSection } from '../../utils/homeNavigation';

const FALLBACK_HERO_IMAGE = '/images/placeholder-image.jpg';

// Upgrade only our bundled assets. Custom videos selected in the admin remain intact.
function currentHeroAsset(value: string) {
  const upgrades: Record<string, string> = {
    '/videos/hero-papagayo-desktop-v1.mp4': '/videos/hero-papagayo-desktop-v2.mp4',
    '/videos/hero-papagayo-mobile-v1.mp4': '/videos/hero-papagayo-mobile-v2.mp4',
    '/images/hero-papagayo-poster-v1.webp': '/images/hero-papagayo-poster-v2.webp',
  };
  return upgrades[value] ?? value;
}

// React 18 doesn't recognize the camelCase `fetchPriority` prop (added in React 19) and
// silently drops it — the lowercase `fetchpriority` HTML attribute reaches the DOM instead.
type FetchPriorityAttr = { fetchpriority?: 'high' | 'low' | 'auto' };

const DEFAULT_HERO_SETTINGS = {
  'home.hero.media_mode': 'image',
  'home.hero.title.es': 'Experimenta el oceano',
  'home.hero.title.en': 'Experience the Ocean',
  'home.hero.eyebrow.es': 'Charters privados - Costa Rica',
  'home.hero.eyebrow.en': 'Private charters - Costa Rica',
  'home.hero.subtitle.es': 'Pesca de clase mundial, vistas impresionantes y recuerdos inolvidables.',
  'home.hero.subtitle.en': 'World-class fishing, stunning views, and unforgettable memories.',
  'home.hero.primary_label.es': 'Reservar ahora',
  'home.hero.primary_label.en': 'Book now',
  'home.hero.primary_href': '#booking',
  'home.hero.primary_enabled': 'true',
  'home.hero.secondary_label.es': 'Ver tours',
  'home.hero.secondary_label.en': 'View tours',
  'home.hero.secondary_href': '#tours',
  'home.hero.secondary_enabled': 'true',
  'home.hero.image': FALLBACK_HERO_IMAGE,
  'home.hero.mobile_image': '',
  'home.hero.video': '',
  'home.hero.mobile_video': '',
  'home.hero.video_poster': '',
  'home.hero.slide_2.image': '',
  'home.hero.slide_2.mobile_image': '',
  'home.hero.slide_3.image': '',
  'home.hero.slide_3.mobile_image': '',
  'home.hero.slide_4.image': '',
  'home.hero.slide_4.mobile_image': '',
  'home.hero.image_alt.es': 'Bote privado navegando en el Pacifico de Costa Rica',
  'home.hero.image_alt.en': 'Private boat sailing Costa Rica Pacific waters',
};

type HeroSettings = typeof DEFAULT_HERO_SETTINGS;

async function getHeroSettings(): Promise<HeroSettings> {
  const keys = Object.keys(DEFAULT_HERO_SETTINGS);
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', keys)
    .eq('active', true);

  if (error) return DEFAULT_HERO_SETTINGS;

  return (data ?? []).reduce<HeroSettings>(
    (settings, row) => ({ ...settings, [row.key]: row.value || settings[row.key as keyof HeroSettings] }),
    { ...DEFAULT_HERO_SETTINGS },
  );
}

function splitTitle(title: string) {
  const [lead, ...rest] = title.trim().split(/\s+/);
  return { lead: lead || title, tail: rest.join(' ') };
}

function getHeroSlides(settings?: HeroSettings) {
  if (!settings) return [];
  return [
    { image: settings['home.hero.image'], mobileImage: settings['home.hero.mobile_image'] },
    { image: settings['home.hero.slide_2.image'], mobileImage: settings['home.hero.slide_2.mobile_image'] },
    { image: settings['home.hero.slide_3.image'], mobileImage: settings['home.hero.slide_3.mobile_image'] },
    { image: settings['home.hero.slide_4.image'], mobileImage: settings['home.hero.slide_4.mobile_image'] },
  ].filter((slide) => slide.image || slide.mobileImage);
}

export function Hero() {
  const { language } = useLanguage();
  const heroQuery = useQuery({ queryKey: ['site-settings', 'home.hero'], queryFn: getHeroSettings, staleTime: 60_000 });
  const hero = heroQuery.data ?? DEFAULT_HERO_SETTINGS;
  const locale = language === 'es' ? 'es' : 'en';
  const slides = useMemo(() => getHeroSlides(heroQuery.data), [heroQuery.data]);
  const [activeSlide, setActiveSlide] = useState(0);
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [failedVideoUrl, setFailedVideoUrl] = useState('');
  const [readyVideoUrl, setReadyVideoUrl] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrl = currentHeroAsset(hero['home.hero.video']);
  const mobileVideoUrl = currentHeroAsset(hero['home.hero.mobile_video']) || videoUrl;
  const selectedVideoUrl = isMobile ? mobileVideoUrl : videoUrl || mobileVideoUrl;
  const poster = currentHeroAsset(hero['home.hero.video_poster']) || (isMobile ? hero['home.hero.mobile_image'] : '') || hero['home.hero.image'];
  const videoReady = readyVideoUrl === selectedVideoUrl;
  const videoMode = hero['home.hero.media_mode'] === 'video';
  // A looping background video replaces the image slideshow outright rather than
  // mixing two independent motion sources; respect prefers-reduced-motion by
  // falling back to a static poster frame instead of autoplaying.
  const showVideo = videoMode && Boolean(selectedVideoUrl) && !reduceMotion && failedVideoUrl !== selectedVideoUrl;
  const title = splitTitle(hero[`home.hero.title.${locale}` as keyof HeroSettings]);
  const primaryEnabled = hero['home.hero.primary_enabled'] !== 'false';
  const secondaryEnabled = hero['home.hero.secondary_enabled'] !== 'false';

  useEffect(() => {
    setActiveSlide(0);
  }, [slides.length]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || videoMode || reduceMotion) return undefined;
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(interval);
  }, [slides.length, videoMode, reduceMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!showVideo || !video) return;
    let disposed = false;
    // Set DOM properties and attributes before play(), including Safari's inline hint.
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    video.controls = false;
    const start = () => {
      if (document.visibilityState === 'hidden' || !video.paused) return;
      void video.play().catch(() => {
        if (!disposed && video.paused) setReadyVideoUrl('');
      });
    };
    video.addEventListener('loadeddata', start);
    document.addEventListener('visibilitychange', start);
    window.addEventListener('pageshow', start);
    // If autoplay is blocked, a normal page interaction can start the background.
    // Until then keep the poster visible, without a native Play overlay.
    document.addEventListener('pointerdown', start, { passive: true });
    document.addEventListener('touchend', start, { passive: true });
    document.addEventListener('keydown', start);
    start();
    return () => {
      disposed = true;
      video.removeEventListener('loadeddata', start);
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('pageshow', start);
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('touchend', start);
      document.removeEventListener('keydown', start);
    };
  }, [showVideo, selectedVideoUrl]);

  function scrollToFleet() {
    scrollToHomeSection('fleet');
  }

  // Hero's CTAs are `#booking` / `#tours` hash strings from settings, kept
  // as a real `href` for right-click/middle-click/no-JS, but routed through
  // the shared nav-frame scroll on a normal click — a plain anchor jump
  // would skip the offset math and land the section under the navbar.
  function handleHeroCta(event: { preventDefault: () => void }, hash: string) {
    const id = hash.replace(/^#/, '');
    if (!id) return;
    event.preventDefault();
    scrollToHomeSection(id);
  }

  return (
    <section
      className="home-section relative min-h-[100svh] overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(73,134,167,0.34),transparent_22rem),linear-gradient(180deg,#0B2842_0%,#061B2F_56%,#020B14_100%)] lg:min-h-[100dvh]"
      id="home"
      data-home-section
      data-nav-href="/"
    >
      {videoMode && poster ? <img
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={poster}
        alt=""
        aria-hidden="true"
        width={1920}
        height={1080}
        loading="eager"
        decoding="async"
        {...({ fetchpriority: 'high' } as FetchPriorityAttr)}
      /> : null}
      {showVideo ? (
        <video
          ref={videoRef}
          key={selectedVideoUrl}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-150 ease-linear"
          style={{ opacity: videoReady ? 1 : 0 }}
          src={selectedVideoUrl}
          poster={poster}
          autoPlay
          muted
          controls={false}
          disablePictureInPicture
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          onPlaying={() => setReadyVideoUrl(selectedVideoUrl)}
          onPause={() => setReadyVideoUrl('')}
          onError={() => setFailedVideoUrl(selectedVideoUrl)}
        />
      ) : videoMode && poster ? null : (
        slides.map((slide, index) => (
          <div
            className={`absolute inset-0 transition-opacity duration-1000 ease-out ${index === activeSlide ? 'opacity-100' : 'opacity-0'}`}
            key={`${slide.image}-${index}`}
          >
            {slide.mobileImage ? (
              <img
                className="h-full w-full object-cover object-center sm:hidden"
                src={slide.mobileImage}
                alt={hero[`home.hero.image_alt.${locale}` as keyof HeroSettings]}
                width={1200}
                height={1500}
                sizes="100vw"
                {...({ fetchpriority: index === 0 ? 'high' : 'auto' } as FetchPriorityAttr)}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ) : null}
            {slide.image ? (
              <img
                className="hidden h-full w-full object-cover object-center sm:block"
                src={slide.image}
                alt={hero[`home.hero.image_alt.${locale}` as keyof HeroSettings]}
                width={1920}
                height={1080}
                sizes="100vw"
                {...({ fetchpriority: index === 0 ? 'high' : 'auto' } as FetchPriorityAttr)}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ) : null}
          </div>
        ))
      )}
      <div className="absolute inset-0 bg-ocean-950/45" />
      {/* Fades to the exact solid color Fleet opens with (ocean-950), so the
          two sections read as one continuous depth rather than a hard cut. */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ocean-950 via-ocean-950/75 to-transparent sm:h-64" />

      <div className="absolute bottom-32 left-1/2 z-10 flex -translate-x-1/2 gap-3 sm:left-auto sm:right-32 sm:translate-x-0 md:bottom-32 lg:right-40">
        <IconButton href={INSTAGRAM_URL} icon={Instagram} label="Instagram" size="md" target="_blank" />
        <IconButton href={FACEBOOK_URL} icon={Facebook} label="Facebook" size="md" target="_blank" />
      </div>

      <a
        className="glass-control glass-interactive glass-focus-ring fixed bottom-4 right-4 z-[70] flex h-[50px] w-[50px] items-center justify-center rounded-full"
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp"
      >
        <img className="block h-[68%] w-[68%] object-contain" src="/images/whatsapp.png" alt="" aria-hidden="true" />
      </a>

      <Container className="relative grid min-h-[100svh] place-items-center px-6 pb-32 pt-24 text-center sm:px-8 sm:pb-20 sm:pt-28 lg:min-h-[100dvh] lg:px-10">
        <div className="mx-auto w-full max-w-[52rem]">
          <motion.p
            className="text-sm font-extrabold uppercase tracking-[0.18em] text-white/75"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            {hero[`home.hero.eyebrow.${locale}` as keyof HeroSettings]}
          </motion.p>
          <motion.h1
            className="mx-auto mt-5 max-w-[48rem] font-display text-[clamp(2.75rem,2.14rem+2.59vw,5.25rem)] font-extrabold leading-[0.98] text-white"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="block font-display font-medium not-italic">{title.lead}</span>
            <span className="block font-semibold">{title.tail}</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 w-full max-w-[40rem] text-balance text-base font-medium leading-7 text-white/80 sm:text-xl sm:leading-8"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
          >
            {hero[`home.hero.subtitle.${locale}` as keyof HeroSettings]}
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
            {primaryEnabled ? (
              <Button href={hero['home.hero.primary_href']} onClick={(event) => handleHeroCta(event, hero['home.hero.primary_href'])} size="lg">
                {hero[`home.hero.primary_label.${locale}` as keyof HeroSettings]}
              </Button>
            ) : null}
            {secondaryEnabled ? (
              <Button href={hero['home.hero.secondary_href']} onClick={(event) => handleHeroCta(event, hero['home.hero.secondary_href'])} size="lg" variant="glass">
                {hero[`home.hero.secondary_label.${locale}` as keyof HeroSettings]}
              </Button>
            ) : null}
            {!primaryEnabled && !secondaryEnabled ? (
              <IconButton icon={ArrowDown} label="Bajar a la flota" size="lg" variant="ghost" onClick={scrollToFleet} />
            ) : null}
          </motion.div>
        </div>
      </Container>

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-ocean-950 to-transparent" />
    </section>
  );
}
