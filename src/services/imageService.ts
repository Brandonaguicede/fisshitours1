import { functionsUrl, supabase } from '../lib/supabase';

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

async function requireToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Se requiere una sesión de admin o editor para gestionar imágenes.');
  return token;
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body && typeof body.message === 'string' ? body.message : 'Error de servidor') as string;
}

export async function uploadStorageImage(input: UploadImageInput): Promise<StorageImage> {
  const token = await requireToken();
  const form = new FormData();
  form.append('file', input.file, input.file instanceof File ? input.file.name : 'image');
  form.append('resourceTable', input.resourceTable);
  form.append('resourceId', input.resourceId);
  if (input.folder) form.append('folder', input.folder);
  if (input.width) form.append('width', String(input.width));
  if (input.height) form.append('height', String(input.height));

  const response = await fetch(`${functionsUrl}/storage-upload-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as StorageImage;
}

export async function deleteStorageImage(input: DeleteImageInput): Promise<void> {
  const token = await requireToken();
  const response = await fetch(`${functionsUrl}/storage-delete-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await errorMessage(response));
}
