import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const pages = JSON.parse(readFileSync('src/constants/seo-pages.json', 'utf8').replace(/^\uFEFF/, ''));
const template = readFileSync('dist/index.html', 'utf8');
const escape = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const [path, page] of Object.entries(pages)) {
  if (path === '/') continue;
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
