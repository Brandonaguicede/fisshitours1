import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders as getCorsHeaders, corsPreflight } from '../_shared/cors.ts';

const ALLOWED_FOLDERS = new Set(['boats', 'tours', 'gallery', 'destinations', 'reviews', 'general']);
const SAFE_PATH_PATTERN = /^[a-z]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

const schema = z
  .object({
    storagePath: z.string().min(1).optional(),
    mediaAssetId: z.string().min(1).optional(),
    resourceTable: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
  })
  .refine((value) => value.storagePath || value.mediaAssetId, { message: 'storagePath or mediaAssetId is required' });

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, DELETE, OPTIONS');
  const json = (body: unknown, status = 200) => jsonResponse(req, body, status, corsHeaders);
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, DELETE, OPTIONS');
  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ message: 'Invalid delete payload', issues: parsed.error.issues }, 400);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    const supabase = getServiceClient();
    if (parsed.data.storagePath && !SAFE_PATH_PATTERN.test(parsed.data.storagePath)) {
      return json({ message: 'Invalid storage path' }, 400);
    }

    let asset: { id: string; provider: string; storage_bucket: string | null; storage_path: string | null; public_url: string | null } | null = null;
    if (parsed.data.mediaAssetId) {
      const { data } = await supabase
        .from('media_assets')
        .select('id, provider, storage_bucket, storage_path, public_url')
        .eq('id', parsed.data.mediaAssetId)
        .single();
      asset = data;
    } else if (parsed.data.storagePath) {
      const { data } = await supabase
        .from('media_assets')
        .select('id, provider, storage_bucket, storage_path, public_url')
        .eq('storage_path', parsed.data.storagePath)
        .single();
      asset = data;
    }
    if (!asset) return json({ message: 'Image asset not found' }, 404);

    if (asset.provider !== 'supabase_storage' || asset.storage_bucket !== 'site-images') {
      return json({ message: 'Image is not managed by Supabase Storage' }, 400);
    }
    const storagePath = asset.storage_path;
    if (!storagePath || !SAFE_PATH_PATTERN.test(storagePath)) {
      return json({ message: 'Invalid storage path' }, 400);
    }
    const folder = storagePath.split('/')[0];
    if (!ALLOWED_FOLDERS.has(folder)) return json({ message: 'Invalid storage path' }, 400);

    const inUse = await imageIsInUse(supabase, storagePath, asset.public_url, parsed.data.resourceTable, parsed.data.resourceId);
    if (inUse) return json({ message: 'Image is still referenced by one or more resources' }, 409);

    const { error: removeError } = await supabase.storage.from('site-images').remove([storagePath]);
    if (removeError) {
      await markPendingDeletion(supabase, asset.id, auth.profile.id, storagePath, 'Storage delete failed');
      return json({ message: 'Storage delete failed. The image was left pending cleanup.' }, 500);
    }

    const { error: assetUpdateError } = await supabase
      .from('media_assets')
      .update({
        active: false,
        pending_deletion: false,
        deletion_error: null,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', asset.id);

    if (assetUpdateError) {
      await supabase.from('audit_log').insert({
        actor_id: auth.profile.id,
        action: 'storage_image_metadata_delete_failed',
        entity_table: 'media_assets',
        entity_id: asset.id,
        metadata: { storage_path: storagePath },
      });
      return json({ message: 'Storage object was deleted, but metadata cleanup failed' }, 500);
    }

    await supabase.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'storage_image_deleted',
      entity_table: 'media_assets',
      entity_id: asset.id,
      metadata: { storage_path: storagePath },
    });

    return json({ ok: true, storage_path: storagePath });
  } catch (error) {
    console.error('storage-delete-image failed', error);
    return jsonResponse(req, { message: 'Internal server error' }, 500, corsHeaders);
  }
});

function jsonResponse(request: Request, body: unknown, status = 200, headers = getCorsHeaders(request, 'POST, DELETE, OPTIONS')) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function imageIsInUse(
  supabase: ReturnType<typeof getServiceClient>,
  storagePath: string,
  publicUrl: string | null,
  ignoredTable?: string,
  ignoredId?: string,
) {
  const refs = publicUrl
    ? [storagePath, publicUrl]
    : [storagePath];
  const withoutIgnored = (query: any, table: string) => {
    if (ignoredTable !== table || !ignoredId) return query;
    return table === 'site_settings' ? query.neq('key', ignoredId) : query.neq('id', ignoredId);
  };
  const checks = [
    withoutIgnored(supabase.from('boats').select('id').or(`image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'boats').limit(1),
    withoutIgnored(supabase.from('boat_images').select('id').or(`storage_path.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`).eq('active', true), 'boat_images').limit(1),
    withoutIgnored(supabase.from('tours').select('id').or(`image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'tours').limit(1),
    withoutIgnored(supabase.from('tour_packages').select('id').or(`image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'tour_packages').limit(1),
    withoutIgnored(supabase.from('gallery_images').select('id').or(`src.in.(${refs.join(',')}),image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'gallery_images').limit(1),
    withoutIgnored(supabase.from('reviews').select('id').or(`image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'reviews').limit(1),
    withoutIgnored(supabase.from('destinations').select('id').or(`image_public_id.in.(${refs.join(',')}),image_url.in.(${refs.join(',')})`), 'destinations').limit(1),
    withoutIgnored(supabase.from('editable_content').select('id').eq('value', storagePath), 'editable_content').limit(1),
    withoutIgnored(supabase.from('site_settings').select('key').eq('value', storagePath), 'site_settings').limit(1),
  ];
  if (publicUrl) checks.push(withoutIgnored(supabase.from('editable_content').select('id').eq('value', publicUrl), 'editable_content').limit(1));
  if (publicUrl) checks.push(withoutIgnored(supabase.from('site_settings').select('key').eq('value', publicUrl), 'site_settings').limit(1));
  const results = await Promise.all(checks);
  return results.some((result) => !result.error && Array.isArray(result.data) && result.data.length > 0);
}

async function markPendingDeletion(
  supabase: ReturnType<typeof getServiceClient>,
  assetId: string,
  actorId: string,
  storagePath: string,
  message: string,
) {
  await supabase
    .from('media_assets')
    .update({
      pending_deletion: true,
      deletion_error: message,
      deletion_attempts: 1,
    })
    .eq('id', assetId);

  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action: 'storage_image_cleanup_pending',
    entity_table: 'media_assets',
    entity_id: assetId,
    metadata: { storage_path: storagePath, reason: message },
  });
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
