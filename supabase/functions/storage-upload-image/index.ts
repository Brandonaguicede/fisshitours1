import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as getCorsHeaders } from '../_shared/cors.ts';

const ALLOWED_FOLDERS = new Set(['boats', 'tours', 'gallery', 'destinations', 'reviews', 'general']);
const ALLOWED_TABLES = new Set(['boats', 'boat_images', 'tours', 'tour_packages', 'gallery_images', 'reviews', 'destinations', 'editable_content', 'site_settings']);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const FOLDER_BY_TABLE: Record<string, string> = {
  boats: 'boats',
  boat_images: 'boats',
  tours: 'tours',
  tour_packages: 'tours',
  gallery_images: 'gallery',
  reviews: 'reviews',
  destinations: 'destinations',
  editable_content: 'general',
  site_settings: 'general',
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Hero background loops are meant to be short (a few seconds) and compressed, not
// full-length promo videos; 40MB is generous headroom without inviting huge uploads.
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const json = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

    const auth = await requireEditor(req);
    if (!auth.ok) return json({ message: auth.message }, auth.status);

    const form = await req.formData();
    const file = form.get('file');
    const resourceTable = String(form.get('resourceTable') ?? '');
    const resourceId = String(form.get('resourceId') ?? '');
    const requestedFolder = String(form.get('folder') ?? '');
    const width = parseDimension(form.get('width'));
    const height = parseDimension(form.get('height'));

    if (!(file instanceof File)) return json({ message: 'Image file is required' }, 400);
    if (!ALLOWED_TABLES.has(resourceTable)) return json({ message: 'Invalid resource association' }, 400);
    if (!resourceId || !RESOURCE_ID_PATTERN.test(resourceId)) return json({ message: 'Invalid resourceId' }, 400);

    const folder = requestedFolder
      ? (ALLOWED_FOLDERS.has(requestedFolder) ? requestedFolder : null)
      : FOLDER_BY_TABLE[resourceTable];
    if (!folder) return json({ message: 'Invalid destination folder' }, 400);

    const isVideo = ALLOWED_VIDEO_MIME_TYPES.has(file.type);
    const isImage = ALLOWED_IMAGE_MIME_TYPES.has(file.type);
    if (!isVideo && !isImage) return json({ message: 'Unsupported file MIME type' }, 415);

    if (file.size === 0) return json({ message: 'File is empty' }, 400);
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) return json({ message: isVideo ? 'Video is too large' : 'Image is too large' }, 413);

    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const detected = isVideo ? detectVideoType(bytes) : detectImageType(bytes);
    if (!detected) return json({ message: isVideo ? 'Invalid video content' : 'Invalid image content' }, 400);
    if (detected.mime !== file.type) return json({ message: 'File content does not match declared type' }, 415);
    if (!filenameMatchesType(file.name, detected.extension)) {
      return json({ message: 'File extension does not match detected type' }, 400);
    }

    const supabase = getServiceClient();
    const resourceExists = await checkResourceExists(supabase, resourceTable, resourceId);
    if (!resourceExists) return json({ message: 'Associated resource was not found' }, 400);

    const resourceSegment = resourceId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
    const objectName = `${crypto.randomUUID()}.${detected.extension}`;
    const storagePath = `${folder}/${resourceSegment}/${objectName}`;
    const originalFilename = sanitizeFilename(file.name);

    const { error: uploadError } = await supabase.storage
      .from('site-images')
      .upload(storagePath, file, { contentType: detected.mime, cacheControl: '31536000', upsert: false });
    if (uploadError) return json({ message: 'Storage upload failed' }, 500);

    const publicUrl = normalizePublicUrl(req, supabase.storage.from('site-images').getPublicUrl(storagePath).data.publicUrl);

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
      return json({ message: 'Failed to register image metadata' }, 500);
    }

    await supabase.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'storage_image_uploaded',
      entity_table: resourceTable,
      entity_id: resourceId,
      metadata: { storage_path: storagePath, public_url: publicUrl, mime_type: detected.mime, size_bytes: file.size },
    });

    return json({
      image_url: publicUrl,
      public_url: publicUrl,
      image_public_id: storagePath,
      storage_bucket: 'site-images',
      storage_path: storagePath,
      mime_type: detected.mime,
      size_bytes: file.size,
      width,
      height,
    }, 201);
  } catch (error) {
    console.error('storage-upload-image failed', error);
    return jsonResponse({ message: 'Internal server error' }, 500, corsHeaders);
  }
});

function jsonResponse(body: unknown, status: number, headers: HeadersInit) {
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

function detectVideoType(bytes: Uint8Array): { mime: string; extension: string } | null {
  // MP4/ISO-BMFF: bytes 4-7 spell "ftyp" regardless of the specific brand.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { mime: 'video/mp4', extension: 'mp4' };
  }
  // WebM/Matroska: EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'video/webm', extension: 'webm' };
  }
  return null;
}

function filenameMatchesType(name: string, extension: string): boolean {
  const lower = name.toLowerCase();
  if (extension === 'jpg') return lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  return lower.endsWith(`.${extension}`);
}

function normalizePublicUrl(req: Request, publicUrl: string): string {
  const url = new URL(publicUrl);
  if (!['kong', 'supabase_kong_propuesta1'].includes(url.hostname)) return publicUrl;
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'http';
  const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!forwardedHost) return publicUrl;
  const forwardedPort = req.headers.get('x-forwarded-port');
  const host = forwardedPort && !forwardedHost.includes(':')
    ? `${forwardedHost}:${forwardedPort}`
    : forwardedHost;
  return `${forwardedProto}://${host}${url.pathname}${url.search}`;
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
