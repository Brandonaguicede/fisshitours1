import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// seo-pages.json became bilingual ({ "/path": { es: {...}, en: {...} } })
// so SeoMetadata.tsx can set the right <title>/description client-side per
// visitor. This script runs BEFORE any JS executes (crawlers/social bots
// read this static file directly), so it has no visitor language to key
// off of \u2014 it prerenders the site's own default language (see
// LanguageContext.tsx: no saved preference falls back to 'en'), matching
// what an unconfigured browser actually sees today. True per-language
// prerendered variants (hreflang alternates) are a separate enhancement,
// not needed to fix the single-language regression this script had.
const DEFAULT_LANGUAGE = 'en';

const pages = JSON.parse(readFileSync('src/constants/seo-pages.json', 'utf8').replace(/^\uFEFF/, ''));
const template = readFileSync('dist/index.html', 'utf8');
const escape = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const [path, entry] of Object.entries(pages)) {
  if (path === '/') continue;
  const page = entry[DEFAULT_LANGUAGE] ?? entry;
  const url = `https://www.papagayofishingtourcr.com${path}`;
  const html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/, `$1${escape(page.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escape(page.title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escape(page.description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`);
  mkdirSync(`dist${path}`, { recursive: true });
  writeFileSync(`dist${path}/index.html`, html);
}
console.log('Generated metadata for public pages.');
