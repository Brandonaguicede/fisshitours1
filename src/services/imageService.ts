import { functionsUrl, supabase, supabasePublishableKey } from '../lib/supabase';

export interface StorageImage {
  image_url: string;
  public_url: string;
  image_public_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface UploadImageInput {
  file: Blob;
  resourceTable: string;
  resourceId: string;
  folder?: string;
  width?: number;
  height?: number;
}

export interface DeleteImageInput {
  storagePath?: string;
  mediaAssetId?: string;
  resourceTable?: string;
  resourceId?: string;
}

export class ImageSessionExpiredError extends Error {
  constructor() {
    super('Tu sesión expiró. Inicia sesión nuevamente');
    this.name = 'ImageSessionExpiredError';
  }
}

interface AuthorizedRequest {
  token: string;
  apikey: string;
}

async function requireAuthorizedRequest(): Promise<AuthorizedRequest> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ImageSessionExpiredError();
  return { token, apikey: supabasePublishableKey };
}

async function refreshAuthorizedRequest(): Promise<AuthorizedRequest> {
  const { data, error } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (error || !token) {
    await supabase.auth.signOut().catch(() => undefined);
    throw new ImageSessionExpiredError();
  }
  return { token, apikey: supabasePublishableKey };
}

function authHeaders(auth: AuthorizedRequest): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.token}`,
    apikey: auth.apikey,
  };
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body && typeof body.message === 'string' ? body.message : 'Error de servidor') as string;
}

export async function uploadStorageImage(input: UploadImageInput): Promise<StorageImage> {
  const form = new FormData();
  form.append('file', input.file, input.file instanceof File ? input.file.name : 'image');
  form.append('resourceTable', input.resourceTable);
  form.append('resourceId', input.resourceId);
  if (input.folder) form.append('folder', input.folder);
  if (input.width) form.append('width', String(input.width));
  if (input.height) form.append('height', String(input.height));

  const response = await authorizedFetch(`${functionsUrl}/storage-upload-image`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as StorageImage;
}

export async function deleteStorageImage(input: DeleteImageInput): Promise<void> {
  const response = await authorizedFetch(`${functionsUrl}/storage-delete-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function uploadStorageImageWithProgress(
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<StorageImage> {
  const firstAuth = await requireAuthorizedRequest();
  const first = await xhrUpload(form, firstAuth, onProgress);
  if (first.status !== 401) return parseUploadResult(first);

  const refreshedAuth = await refreshAuthorizedRequest();
  const retry = await xhrUpload(form, refreshedAuth, onProgress);
  if (retry.status === 401) {
    await supabase.auth.signOut().catch(() => undefined);
    throw new ImageSessionExpiredError();
  }
  return parseUploadResult(retry);
}

async function authorizedFetch(url: string, init: RequestInit): Promise<Response> {
  const firstAuth = await requireAuthorizedRequest();
  const first = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders(firstAuth) },
  });
  if (first.status !== 401) return first;

  const refreshedAuth = await refreshAuthorizedRequest();
  const retry = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders(refreshedAuth) },
  });
  if (retry.status === 401) {
    await supabase.auth.signOut().catch(() => undefined);
    throw new ImageSessionExpiredError();
  }
  return retry;
}

function xhrUpload(
  form: FormData,
  auth: AuthorizedRequest,
  onProgress: (percent: number) => void,
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${functionsUrl}/storage-upload-image`);
    const headers = authHeaders(auth);
    xhr.setRequestHeader('Authorization', headers.Authorization);
    xhr.setRequestHeader('apikey', headers.apikey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
    xhr.onerror = () => reject(new Error('Error de red al subir la imagen.'));
    xhr.send(form);
  });
}

function parseUploadResult(result: { status: number; responseText: string }): StorageImage {
  if (result.status >= 200 && result.status < 300) return JSON.parse(result.responseText) as StorageImage;
  let message = 'Error al subir la imagen.';
  try {
    const body = JSON.parse(result.responseText);
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // ignore parse errors
  }
  throw new Error(message);
}
