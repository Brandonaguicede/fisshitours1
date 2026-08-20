import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_FOLDERS = new Set(['boats', 'tours', 'gallery', 'destinations', 'reviews', 'general']);
const ALLOWED_TABLES = new Set(['boats', 'tours', 'tour_packages', 'gallery_images', 'reviews', 'destinations', 'editable_content', 'site_settings']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FOLDER_BY_TABLE: Record<string, string> = {
  boats: 'boats',
  tours: 'tours',
  tour_packages: 'tours',
  gallery_images: 'gallery',
  reviews: 'reviews',
  destinations: 'destinations',
  editable_content: 'general',
  site_settings: 'general',
};
const MAX_BYTES = 10 * 1024 * 1024;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

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

  const form = await req.formData();
  const file = form.get('file');
  const resourceTable = String(form.get('resourceTable') ?? '');
  const resourceId = String(form.get('resourceId') ?? '');
  const requestedFolder = String(form.get('folder') ?? '');
  const width = parseDimension(form.get('width'));
  const height = parseDimension(form.get('height'));

  if (!(file instanceof File)) return Response.json({ message: 'Image file is required' }, { status: 400, headers });
  if (!ALLOWED_TABLES.has(resourceTable)) return Response.json({ message: 'Invalid resource association' }, { status: 400, headers });
  if (!resourceId || !RESOURCE_ID_PATTERN.test(resourceId)) return Response.json({ message: 'Invalid resourceId' }, { status: 400, headers });

  const folder = requestedFolder
    ? (ALLOWED_FOLDERS.has(requestedFolder) ? requestedFolder : null)
    : FOLDER_BY_TABLE[resourceTable];
  if (!folder) return Response.json({ message: 'Invalid destination folder' }, { status: 400, headers });

  if (file.size === 0) return Response.json({ message: 'Image file is empty' }, { status: 400, headers });
  if (file.size > MAX_BYTES) return Response.json({ message: 'Image is too large' }, { status: 400, headers });
  if (!ALLOWED_MIME_TYPES.has(file.type)) return Response.json({ message: 'Unsupported image MIME type' }, { status: 400, headers });

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) return Response.json({ message: 'Invalid image content' }, { status: 400, headers });
  if (detected.mime !== file.type) return Response.json({ message: 'Image content does not match declared type' }, { status: 400, headers });

  const supabase = getServiceClient();
  const resourceExists = await checkResourceExists(supabase, resourceTable, resourceId);
  if (!resourceExists) return Response.json({ message: 'Associated resource was not found' }, { status: 400, headers });

  const resourceSegment = resourceId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
  const objectName = `${crypto.randomUUID()}.${detected.extension}`;
  const storagePath = `${folder}/${resourceSegment}/${objectName}`;
  const originalFilename = sanitizeFilename(file.name);

  const { error: uploadError } = await supabase.storage
    .from('site-images')
    .upload(storagePath, file, { contentType: detected.mime, cacheControl: '31536000', upsert: false });
  if (uploadError) return Response.json({ message: 'Storage upload failed' }, { status: 400, headers });

  const publicUrl = supabase.storage.from('site-images').getPublicUrl(storagePath).data.publicUrl;

  const { error: insertError } = await supabase.from('media_assets').insert({
    provider: 'supabase_storage',
    provider_id: storagePath,
    url: publicUrl,
    mime_type: detected.mime,
    byte_size: file.size,
    size_bytes: file.size,
    width,
    height,
    storage_bucket: 'site-images',
    storage_path: storagePath,
    public_url: publicUrl,
    original_filename: originalFilename,
    resource_table: resourceTable,
    resource_id: resourceId,
    created_by: auth.profile.id,
    uploaded_by: auth.profile.id,
  });

  if (insertError) {
    await supabase.storage.from('site-images').remove([storagePath]);
    return Response.json({ message: 'Failed to register image metadata' }, { status: 500, headers });
  }

  await supabase.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'storage_image_uploaded',
    entity_table: resourceTable,
    entity_id: resourceId,
    metadata: { storage_path: storagePath, public_url: publicUrl, mime_type: detected.mime, size_bytes: file.size },
  });

  return Response.json({
    image_url: publicUrl,
    public_url: publicUrl,
    image_public_id: storagePath,
    storage_bucket: 'site-images',
    storage_path: storagePath,
    mime_type: detected.mime,
    size_bytes: file.size,
    width,
    height,
  }, { status: 201, headers });
});

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase secrets are not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseDimension(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const n = Number(String(value));
  if (!Number.isInteger(n) || n <= 0 || n > 20000) return null;
  return n;
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'image';
  return base.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'image';
}

function detectImageType(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', extension: 'png' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

async function checkResourceExists(supabase: ReturnType<typeof getServiceClient>, table: string, id: string) {
  const idColumn = table === 'site_settings' ? 'key' : 'id';
  const { data, error } = await supabase.from(table).select(idColumn).eq(idColumn, id).limit(1);
  return !error && Array.isArray(data) && data.length === 1;
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
