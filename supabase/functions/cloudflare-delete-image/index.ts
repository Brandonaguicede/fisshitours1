import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const schema = z.object({ imagePublicId: z.string().min(1) });
const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid delete payload', issues: parsed.error.issues }, { status: 400, headers });

  const auth = await requireEditor(req);
  if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status, headers });

  const supabase = getServiceClient();
  const { data: asset } = await supabase
    .from('media_assets')
    .select('provider_id')
    .eq('provider_id', parsed.data.imagePublicId)
    .single();
  if (!asset) return Response.json({ message: 'Image asset not found' }, { status: 404, headers });

  const inUse = await imageIsInUse(parsed.data.imagePublicId);
  if (inUse) return Response.json({ message: 'Image is still referenced by one or more resources' }, { status: 409, headers });

  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_IMAGES_API_TOKEN');
  if (!accountId || !token) return Response.json({ message: 'Cloudflare secrets are not configured' }, { status: 500, headers });

  const cfResponse = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(parsed.data.imagePublicId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const cfData = await cfResponse.json().catch(() => ({}));
  if (cfResponse.status !== 404 && (!cfResponse.ok || cfData.success === false)) {
    return Response.json({ message: 'Cloudflare delete failed' }, { status: 400, headers });
  }

  await supabase.from('media_assets').delete().eq('provider_id', parsed.data.imagePublicId);
  await supabase.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'cloudflare_image_deleted',
    entity_table: 'media_assets',
    entity_id: parsed.data.imagePublicId,
    metadata: { image_public_id: parsed.data.imagePublicId },
  });

  return Response.json({ ok: true, image_public_id: parsed.data.imagePublicId }, { headers });
});

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchWithTimeout(input: string, init: RequestInit, ms = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function imageIsInUse(imagePublicId: string) {
  const supabase = getServiceClient();
  const checks = [
    supabase.from('boats').select('id').eq('image_public_id', imagePublicId).limit(1),
    supabase.from('tours').select('id').eq('image_public_id', imagePublicId).limit(1),
    supabase.from('tour_packages').select('id').eq('image_public_id', imagePublicId).limit(1),
    supabase.from('gallery_images').select('id').eq('image_public_id', imagePublicId).limit(1),
    supabase.from('reviews').select('id').eq('image_public_id', imagePublicId).limit(1),
    supabase.from('destinations').select('id').eq('image_public_id', imagePublicId).limit(1),
  ];
  const results = await Promise.all(checks);
  return results.some((result) => Array.isArray(result.data) && result.data.length > 0);
}

async function requireEditor(req: Request): Promise<
  | { ok: true; profile: { id: string; role: string } }
  | { ok: false; status: number; message: string }
> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, message: 'Authentication required' };

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { ok: false, status: 401, message: 'Invalid session' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single();

  if (!profile?.active || !['admin', 'editor'].includes(profile.role)) {
    return { ok: false, status: 403, message: 'Admin or editor role required' };
  }
  return { ok: true, profile };
}
