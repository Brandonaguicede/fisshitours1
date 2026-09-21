import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pages from '../../constants/seo-pages.json';
import { useLanguage } from '../../i18n/LanguageContext';

const FALLBACK_TITLE = { es: 'Papagayo Fishing Tours', en: 'Papagayo Fishing Tours' };
const FALLBACK_DESCRIPTION = { es: 'Papagayo Fishing Tours en Costa Rica.', en: 'Papagayo Fishing Tours in Costa Rica.' };

export function SeoMetadata() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  useEffect(() => {
    const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    const page = pages[path as keyof typeof pages]?.[language];
    const title = page?.title ?? FALLBACK_TITLE[language];
    document.title = title;
    document.documentElement.lang = language;
    document.querySelector('meta[name="description"]')?.setAttribute('content', page?.description ?? FALLBACK_DESCRIPTION[language]);
    document.querySelector('meta[name="robots"]')?.setAttribute('content', page ? 'index, follow, max-image-preview:large' : 'noindex, follow');
    const url = `https://www.papagayofishingtourcr.com${path}`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (page) canonical?.setAttribute('href', url);
    else canonical?.removeAttribute('href');
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', page?.description ?? FALLBACK_DESCRIPTION[language]);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    document.querySelector('meta[property="og:locale"]')?.setAttribute('content', language === 'es' ? 'es_CR' : 'en_US');
  }, [pathname, language]);
  return null;
}
