import { ArrowDown, Facebook, Instagram } from 'lucide-react';
import { motion } from 'framer-motion';

import { Container } from '../common/Container';
import { WHATSAPP_NUMBER } from '../../constants/contact';
import { useLanguage } from '../../i18n/LanguageContext';

export function Hero() {
  const { language } = useLanguage();

  function scrollToFleet() {
    document.getElementById('fleet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="relative min-h-[100dvh] overflow-hidden bg-ocean-950">
      <video
        className="absolute inset-0 h-full w-full object-cover object-center"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src="/videos/hero-ocean-charter.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 gap-3 sm:left-auto sm:right-32 sm:translate-x-0 md:bottom-24 lg:right-40">
        <a className="focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/8 text-white backdrop-blur-xl hover:bg-white/15" href="https://instagram.com" aria-label="Instagram">
          <Instagram size={18} />
        </a>
        <a className="focus-ring pressable grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/8 text-white backdrop-blur-xl hover:bg-white/15" href="https://facebook.com" aria-label="Facebook">
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

      <Container className="relative grid min-h-[100dvh] place-items-center px-6 pb-16 pt-28 text-center">
        <div className="mx-auto max-w-[980px]">
          <motion.p
            className="text-sm font-extrabold uppercase tracking-[0.18em] text-white/75"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            {language === 'es' ? 'Charters privados - Costa Rica' : 'Private charters - Costa Rica'}
          </motion.p>
          <motion.h1
            className="mt-5 font-display text-5xl font-extrabold leading-[0.92] text-white sm:text-6xl md:text-7xl lg:text-8xl"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="block font-serifDisplay text-[1.18em] font-normal italic leading-[0.82]">{language === 'es' ? 'Experimenta' : 'Experience'}</span>
            <span className="block">{language === 'es' ? 'el océano' : 'the Ocean'}</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-[660px] text-lg font-medium leading-8 text-white/78 sm:text-xl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
          >
            {language === 'es'
              ? 'Pesca de clase mundial, vistas impresionantes y recuerdos inolvidables.'
              : 'World-class fishing, stunning views, and unforgettable memories.'}
          </motion.p>

          <motion.button
            className="focus-ring pressable mx-auto mt-10 grid h-12 w-12 place-items-center rounded-full border border-white/35 bg-transparent text-white shadow-soft hover:border-white/70"
            type="button"
            aria-label="Bajar a la flota"
            onClick={scrollToFleet}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: [0, 8, 0] }}
            transition={{ opacity: { duration: 0.7, delay: 0.24, ease: [0.23, 1, 0.32, 1] }, y: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <ArrowDown size={21} />
          </motion.button>
        </div>
      </Container>

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-ocean-950 to-transparent" />
    </section>
  );
}
