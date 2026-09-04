import { Loader2, Trash2, UploadCloud, Video as VideoIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { deleteStorageImage, ImageSessionExpiredError, uploadStorageImageWithProgress, type StorageImage } from '../../services/imageService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatBytes } from '../../utils/format';

const ALLOWED_TYPES = ['video/mp4', 'video/webm'];
const MAX_BYTES = 40 * 1024 * 1024;

interface AdminVideoManagerProps {
  resourceTable: string;
  resourceId: string;
  folder?: string;
  currentVideoUrl?: string | null;
  currentStoragePath?: string | null;
  label?: string;
  disabled?: boolean;
  onVideoSaved?: (video: StorageImage) => Promise<void> | void;
  onVideoDeleted?: (storagePath: string) => Promise<void> | void;
}

/**
 * Minimal counterpart to AdminImageManager for short background-loop videos: no
 * cropping (a video cannot be re-encoded in the browser the way an image can), just
 * validate, upload as-is, and preview. Reuses the same upload/delete edge functions
 * and site_settings wiring, so it slots into the same admin patterns as images.
 */
export default function AdminVideoManager({
  resourceTable,
  resourceId,
  folder,
  currentVideoUrl,
  currentStoragePath,
  label,
  disabled = false,
  onVideoSaved,
  onVideoDeleted,
}: AdminVideoManagerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(currentVideoUrl ?? null);
  const [storagePath, setStoragePath] = useState<string | null>(currentStoragePath ?? null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);

  async function acceptFile(file: File | null) {
    if (disabled || !file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage({ kind: 'error', text: 'Formato no admitido. Usa MP4 o WebM.' });
      return;
    }
    if (file.size === 0) {
      setMessage({ kind: 'error', text: 'El archivo está vacío.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ kind: 'error', text: `El video supera los ${formatBytes(MAX_BYTES)}. Comprímelo o acórtalo (recomendado: un clip corto de pocos segundos).` });
      return;
    }
    setMessage(null);
    await uploadToStorage(file);
  }

  async function uploadToStorage(file: File) {
    setUploading(true);
    setProgress(0);
    setMessage(null);
    const previousStoragePath = storagePath;
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase no esta configurado para gestionar videos en este entorno.');
      }

      if (resourceTable === 'site_settings') {
        const { error } = await supabase.from('site_settings').upsert({
          key: resourceId,
          value: videoUrl ?? '',
          type: 'video',
          active: true,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }

      const form = new FormData();
      form.append('file', file, file.name);
      form.append('resourceTable', resourceTable);
      form.append('resourceId', resourceId);
      if (folder) form.append('folder', folder);

      const video = await uploadStorageImageWithProgress(form, setProgress);

      try {
        await onVideoSaved?.(video);
      } catch (error) {
        try {
          await deleteStorageImage({ storagePath: video.storage_path, resourceTable, resourceId });
        } catch {
          // storage-delete-image records pending cleanup when the object cannot be removed.
        }
        throw new Error(error instanceof Error ? error.message : 'Video subido, pero no se pudo actualizar la referencia del recurso.');
      }

      setVideoUrl(video.public_url);
      setStoragePath(video.storage_path);

      if (previousStoragePath && previousStoragePath !== video.storage_path) {
        try {
          await deleteStorageImage({ storagePath: previousStoragePath, resourceTable, resourceId });
        } catch {
          setMessage({ kind: 'warning', text: `Nuevo video guardado (${formatBytes(file.size)}). El video anterior queda pendiente de limpieza: ${previousStoragePath}` });
          return;
        }
      }

      setMessage({ kind: 'success', text: `Video guardado en Supabase Storage (${formatBytes(file.size)}).` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al subir el video.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!storagePath) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setMessage(null);
    try {
      await deleteStorageImage({ storagePath, resourceTable, resourceId });
      await onVideoDeleted?.(storagePath);
      setVideoUrl(null);
      setStoragePath(null);
      setConfirmDelete(false);
      setMessage({ kind: 'success', text: 'Video eliminado de Supabase Storage.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo eliminar el video. La referencia actual se conserva.' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-image-manager">
      <div className="admin-image-manager__preview" aria-disabled={disabled || undefined}>
        {videoUrl ? (
          <video src={videoUrl} controls muted loop playsInline aria-label={label ?? 'Video actual'} />
        ) : (
          <div className="admin-image-manager__empty">
            <VideoIcon size={28} />
            <span>Elige un archivo de video (MP4 o WebM)</span>
          </div>
        )}
        {uploading ? <div className="admin-image-manager__overlay"><Loader2 className="animate-spin" size={22} />Subiendo {progress}%</div> : null}
      </div>

      {videoUrl && storagePath ? <p className="admin-image-manager__path" title={storagePath}>{storagePath}</p> : null}

      <div className="admin-image-manager__actions">
        <label className="admin-btn admin-btn--secondary admin-image-manager__pick" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <UploadCloud size={16} /> {videoUrl ? 'Reemplazar video' : 'Subir video'}
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="sr-only"
            aria-label="Elegir archivo de video"
            disabled={disabled}
            onChange={(event) => void acceptFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {videoUrl && storagePath ? (
          <button className="admin-btn admin-btn--danger admin-image-manager__delete" type="button" onClick={() => void handleDelete()} disabled={deleting || uploading}>
            {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            {confirmDelete ? '¿Confirmar eliminar?' : 'Eliminar'}
          </button>
        ) : null}
        {confirmDelete ? <button className="admin-btn admin-btn--ghost" type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button> : null}
      </div>

      {message ? (
        <div className={`admin-alert admin-alert--${message.kind}`} role="status" aria-live="polite">
          <span>{message.text}</span>
          {message.text === new ImageSessionExpiredError().message ? (
            <a className="ml-2 font-extrabold underline" href="/admin/login">Ir al login</a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
