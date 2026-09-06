const encoder = new TextEncoder();

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function encodePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function config() {
  const endpoint = required('STORAGE_ENDPOINT').replace(/\/$/, '');
  const bucket = required('STORAGE_BUCKET');
  const region = Deno.env.get('STORAGE_REGION')?.trim() || 'auto';
  const accessKey = required('STORAGE_ACCESS_KEY');
  const secretKey = required('STORAGE_SECRET_KEY');
  const forcePathStyle = Deno.env.get('STORAGE_FORCE_PATH_STYLE') === 'true';
  const autoCreateBucket = Deno.env.get('STORAGE_AUTO_CREATE_BUCKET') === 'true';
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.pathname !== '/' && endpointUrl.pathname !== '') throw new Error('STORAGE_ENDPOINT must not include a bucket path');
  if (autoCreateBucket) throw new Error('STORAGE_AUTO_CREATE_BUCKET must remain false for production');
  const host = forcePathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
  const basePath = forcePathStyle ? `/${encodeURIComponent(bucket)}` : '';
  return { endpointUrl, bucket, region, accessKey, secretKey, host, basePath };
}

async function signedRequest(method: string, objectPath: string, body?: Uint8Array, contentType?: string): Promise<Response> {
  const { endpointUrl, region, accessKey, secretKey, host, basePath } = config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const encodedObjectPath = encodePath(objectPath);
  const canonicalUri = `${basePath}/${encodedObjectPath}`;
  const payloadHash = await sha256(body ?? new Uint8Array());
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((key) => `${key}:${headers[key].trim()}\n`).join('');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonicalRequest)].join('\n');
  const dateKey = await hmac(encoder.encode(`AWS4${secretKey}`), date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  const signature = hex(await hmac(signingKey, stringToSign));
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpointUrl.protocol}//${host}${canonicalUri}`;
  return fetch(url, { method, headers, body: body as BodyInit | undefined });
}

export async function putR2Object(path: string, body: Uint8Array, contentType: string): Promise<void> {
  const response = await signedRequest('PUT', path, body, contentType);
  if (!response.ok) {
    const detail = (await response.text()).match(/<(?:Code|Message)>([^<]+)</)?.[1] ?? 'unknown';
    throw new Error(`R2 upload failed (${response.status}): ${detail}`);
  }
}

export async function deleteR2Object(path: string): Promise<void> {
  const response = await signedRequest('DELETE', path);
  if (!response.ok && response.status !== 404) {
    const detail = (await response.text()).match(/<(?:Code|Message)>([^<]+)</)?.[1] ?? 'unknown';
    throw new Error(`R2 delete failed (${response.status}): ${detail}`);
  }
}

export function r2Bucket(): string {
  return required('STORAGE_BUCKET');
}

export function r2PublicUrl(path: string): string {
  const base = required('STORAGE_PUBLIC_BASE_URL').replace(/\/$/, '');
  return `${base}/${encodePath(path)}`;
}
