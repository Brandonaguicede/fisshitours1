import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pages from '../../constants/seo-pages.json';

export function SeoMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    const page = pages[path as keyof typeof pages];
    const title = page?.title ?? 'Papagayo Fishing Tours';
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', page?.description ?? 'Papagayo Fishing Tours in Costa Rica.');
    document.querySelector('meta[name="robots"]')?.setAttribute('content', page ? 'index, follow, max-image-preview:large' : 'noindex, follow');
    const url = `https://www.papagayofishingtourcr.com${path}`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (page) canonical?.setAttribute('href', url);
    else canonical?.removeAttribute('href');
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', page?.description ?? 'Papagayo Fishing Tours in Costa Rica.');
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  }, [pathname]);
  return null;
}
