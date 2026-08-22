const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Accepts every Vercel domain variant of this project (repo is "fisshitours1",
// but some links/aliases use "fishshitours1", so both spellings are allowed):
//   fisshitours1-<hash>-papagayo-fishingtour.vercel.app        (deployment)
//   fisshitours1-git-<branch>-...-papagayo-fishingtour.vercel.app (branch)
//   fisshitours1-papagayo-fishingtour.vercel.app                (project root)
const VERCEL_PREVIEW_PATTERN = /^https:\/\/(?:fishshitours1|fisshitours1)(?:-[a-z0-9]+|-git-[a-z0-9-]+)?-papagayo-fishingtour\.vercel\.app$/;

const PRODUCTION_ORIGINS = new Set([
  'https://papagayofishingtours.com',
  'https://www.papagayofishingtours.com',
]);

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (LOCAL_ORIGIN_PATTERN.test(origin)) return origin;
  if (PRODUCTION_ORIGINS.has(origin)) return origin;
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return origin;
  if (origin === Deno.env.get('ALLOWED_ORIGIN')) return origin;
  return null;
}

export function corsHeaders(req: Request, methods = 'POST, DELETE, OPTIONS'): HeadersInit {
  const origin = getAllowedOrigin(req);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  };
}

export function corsPreflight(req: Request, methods = 'POST, DELETE, OPTIONS') {
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}
