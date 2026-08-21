import { ArrowDown, Facebook, Instagram } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

import { Container } from '../common/Container';
import { FACEBOOK_URL, INSTAGRAM_URL, WHATSAPP_NUMBER } from '../../constants/contact';
import { useLanguage } from '../../i18n/LanguageContext';
import { supabase } from '../../lib/supabase';

const FALLBACK_HERO_IMAGE = '/images/placeholder-image.jpg';

const DEFAULT_HERO_SETTINGS = {
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

export function Hero() {
  const { language } = useLanguage();
  const heroQuery = useQuery({ queryKey: ['site-settings', 'home.hero'], queryFn: getHeroSettings, staleTime: 60_000 });
  const hero = heroQuery.data ?? DEFAULT_HERO_SETTINGS;
  const locale = language === 'es' ? 'es' : 'en';
  const title = splitTitle(hero[`home.hero.title.${locale}` as keyof HeroSettings]);
  const primaryEnabled = hero['home.hero.primary_enabled'] !== 'false';
  const secondaryEnabled = hero['home.hero.secondary_enabled'] !== 'false';

  function scrollToFleet() {
    document.getElementById('fleet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="relative min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(73,134,167,0.34),transparent_22rem),linear-gradient(180deg,#0B2842_0%,#061B2F_56%,#020B14_100%)]">
      <img
        className="absolute inset-0 h-full w-full object-cover object-center"
        src={hero['home.hero.image'] || FALLBACK_HERO_IMAGE}
        alt={hero[`home.hero.image_alt.${locale}` as keyof HeroSettings]}
        width={1920}
        height={1080}
        fetchPriority="high"
        decoding="async"
      />
      <div className="absolute inset-0 bg-ocean-950/45" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 gap-3 sm:left-auto sm:right-32 sm:translate-x-0 md:bottom-24 lg:right-40">
        <a className="focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/8 text-white backdrop-blur-xl hover:bg-white/15" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram">
          <Instagram size={18} />
        </a>
        <a className="focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/8 text-white backdrop-blur-xl hover:bg-white/15" href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook">
          <Facebook size={18} />
        </a>
      </div>

      <a
        className="focus-ring group fixed bottom-5 right-5 z-[70] grid h-14 w-14 place-items-center rounded-full transition-transform duration-200 ease-out hover:scale-110 active:scale-95 sm:bottom-6 sm:right-6"
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp"
      >
        <img className="h-full w-full object-contain transition duration-200 ease-out group-hover:brightness-110 group-hover:drop-shadow-[0_10px_18px_rgba(37,211,102,0.34)]" src="/images/whatsapp.png" alt="" aria-hidden="true" />
      </a>

      <Container className="relative grid min-h-[100dvh] place-items-center px-4 pb-32 pt-24 text-center sm:px-6 sm:pb-20 sm:pt-28">
        <div className="mx-auto max-w-[980px]">
          <motion.p
            className="text-sm font-extrabold uppercase tracking-[0.18em] text-white/75"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            {hero[`home.hero.eyebrow.${locale}` as keyof HeroSettings]}
          </motion.p>
          <motion.h1
            className="mt-5 font-display text-[clamp(3rem,14vw,8rem)] font-extrabold leading-[0.92] text-white"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="block font-serifDisplay text-[1.18em] font-normal italic leading-[0.82]">{title.lead}</span>
            <span className="block">{title.tail}</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-[660px] text-base font-medium leading-7 text-white/78 sm:text-xl sm:leading-8"
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
              <a className="focus-ring pressable inline-flex min-h-12 items-center rounded-full bg-seafoam-400 px-6 text-sm font-extrabold text-ocean-950 shadow-soft hover:bg-seafoam-300" href={hero['home.hero.primary_href']}>
                {hero[`home.hero.primary_label.${locale}` as keyof HeroSettings]}
              </a>
            ) : null}
            {secondaryEnabled ? (
              <a className="focus-ring pressable inline-flex min-h-12 items-center rounded-full border border-white/35 bg-white/10 px-6 text-sm font-extrabold text-white shadow-soft hover:border-white/70" href={hero['home.hero.secondary_href']}>
                {hero[`home.hero.secondary_label.${locale}` as keyof HeroSettings]}
              </a>
            ) : null}
            {!primaryEnabled && !secondaryEnabled ? (
              <button
                className="focus-ring pressable grid h-12 w-12 place-items-center rounded-full border border-white/35 bg-transparent text-white shadow-soft hover:border-white/70"
                type="button"
                aria-label="Bajar a la flota"
                onClick={scrollToFleet}
              >
                <ArrowDown size={21} />
              </button>
            ) : null}
          </motion.div>
        </div>
      </Container>

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-ocean-950 to-transparent" />
    </section>
  );
}
