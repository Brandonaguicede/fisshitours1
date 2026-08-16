import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const auth = await requireEditor(req);
  if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status, headers });

  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_IMAGES_API_TOKEN');
  const accountHash = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH');
  if (!accountId || !token || !accountHash) return Response.json({ message: 'Cloudflare secrets are not configured' }, { status: 500, headers });

  const form = await req.formData();
  const file = form.get('file');
  const resourceTable = String(form.get('resourceTable') ?? '');
  const resourceId = String(form.get('resourceId') ?? '');
  const allowedTables = new Set(['boats', 'tours', 'tour_packages', 'gallery_images', 'reviews', 'destinations', 'editable_content']);

  if (!(file instanceof File)) return Response.json({ message: 'Image file is required' }, { status: 400, headers });
  if (!allowedTables.has(resourceTable)) return Response.json({ message: 'Invalid resource association' }, { status: 400, headers });
  if (!resourceId) return Response.json({ message: 'resourceId is required' }, { status: 400, headers });

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const maxBytes = 8 * 1024 * 1024;
  if (!allowedTypes.has(file.type)) return Response.json({ message: 'Unsupported image MIME type' }, { status: 400, headers });
  if (file.size === 0) return Response.json({ message: 'Image file is empty' }, { status: 400, headers });
  if (file.size > maxBytes) return Response.json({ message: 'Image is too large' }, { status: 400, headers });

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasValidImageSignature(file.type, bytes)) return Response.json({ message: 'Invalid image content' }, { status: 400, headers });

  const supabase = getServiceClient();
  const resourceExists = await checkResourceExists(supabase, resourceTable, resourceId);
  if (!resourceExists) return Response.json({ message: 'Associated resource was not found' }, { status: 400, headers });

  const uploadForm = new FormData();
  uploadForm.append('file', file);
  uploadForm.append('metadata', JSON.stringify({ resourceTable, resourceId, uploadedBy: auth.profile.id }));

  const cfResponse = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  });
  const cfData = await cfResponse.json();
  if (!cfResponse.ok || !cfData.success) return Response.json({ message: 'Cloudflare upload failed' }, { status: 400, headers });

  const imageId = cfData.result.id as string;
  const imageUrl = `https://imagedelivery.net/${accountHash}/${imageId}/public`;

  await supabase.from('media_assets').insert({
    provider_id: imageId,
    url: imageUrl,
    mime_type: file.type,
    byte_size: file.size,
    width: cfData.result.meta?.width ?? null,
    height: cfData.result.meta?.height ?? null,
    resource_table: resourceTable,
    resource_id: resourceId,
    created_by: auth.profile.id,
  });

  await supabase.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'cloudflare_image_uploaded',
    entity_table: resourceTable,
    entity_id: resourceId,
    metadata: { image_public_id: imageId, image_url: imageUrl },
  });

  return Response.json({
    image_url: imageUrl,
    image_public_id: imageId,
    width: cfData.result.meta?.width ?? null,
    height: cfData.result.meta?.height ?? null,
  }, { status: 201, headers });
});

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

function hasValidImageSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === 'image/gif') return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  if (mimeType === 'image/webp') {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

async function checkResourceExists(supabase: ReturnType<typeof getServiceClient>, table: string, id: string) {
  const idColumn = table === 'editable_content' ? 'id' : 'id';
  const { data, error } = await supabase.from(table).select(idColumn).eq(idColumn, id).limit(1);
  return !error && Array.isArray(data) && data.length === 1;
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
