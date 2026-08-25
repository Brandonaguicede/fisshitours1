import imageCompression from 'browser-image-compression';
import { Crop, ImagePlus, Loader2, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

import { Modal } from '../common/Modal';
import ModalFooter from './ModalFooter';
import { deleteStorageImage, ImageSessionExpiredError, uploadStorageImageWithProgress, type StorageImage } from '../../services/imageService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatBytes } from '../../utils/format';

interface AdminImageManagerProps {
  resourceTable: string;
  resourceId: string;
  folder?: string;
  currentImageUrl?: string | null;
  currentStoragePath?: string | null;
  aspect?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxSizeMB?: number;
  previewAspect?: number;
  label?: string;
  requireReplacementToDelete?: boolean;
  onImageSaved?: (image: StorageImage) => Promise<void> | void;
  onImageDeleted?: (storagePath: string) => Promise<void> | void;
}

interface CropFile {
  objectUrl: string;
  blob: Blob;
  originalSize: number;
}

export default function AdminImageManager({
  resourceTable,
  resourceId,
  folder,
  currentImageUrl,
  currentStoragePath,
  aspect = 16 / 9,
  maxWidth = 1600,
  maxHeight = 1200,
  maxSizeMB = 2,
  previewAspect,
  label,
  requireReplacementToDelete = false,
  onImageSaved,
  onImageDeleted,
}: AdminImageManagerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl ?? null);
  const [storagePath, setStoragePath] = useState<string | null>(currentStoragePath ?? null);
  const [cropFile, setCropFile] = useState<CropFile | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setImageUrl(currentImageUrl ?? null);
    setStoragePath(currentStoragePath ?? null);
  }, [currentImageUrl, currentStoragePath]);

  useEffect(() => {
    return () => {
      if (cropFile) URL.revokeObjectURL(cropFile.objectUrl);
    };
  }, [cropFile]);

  function acceptFile(file: File | null) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setMessage({ kind: 'error', text: 'Formato no admitido. Usa JPG, PNG o WebP.' });
      return;
    }
    if (file.size === 0) {
      setMessage({ kind: 'error', text: 'El archivo está vacío.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ kind: 'error', text: 'La imagen supera los 10 MB.' });
      return;
    }
    setMessage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropFile({ objectUrl: URL.createObjectURL(file), blob: file, originalSize: file.size });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function confirmCrop() {
    if (!cropFile || !croppedAreaPixels) return;
    setProcessing(true);
    setMessage(null);
    try {
      const image = await createImageBitmap(cropFile.blob);
      const scale = Math.min(maxWidth / croppedAreaPixels.width, maxHeight / croppedAreaPixels.height, 1);
      const targetWidth = Math.max(1, Math.round(croppedAreaPixels.width * scale));
      const targetHeight = Math.max(1, Math.round(croppedAreaPixels.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas no disponible.');
      ctx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, targetWidth, targetHeight);
      image.close();

      const webpBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo convertir la imagen a WebP.'))), 'image/webp', 0.85);
      });

      let finalBlob = webpBlob;
      if (webpBlob.size > maxSizeMB * 1024 * 1024) {
        finalBlob = await imageCompression(new File([webpBlob], 'image.webp', { type: 'image/webp' }), {
          maxSizeMB,
          maxWidthOrHeight: Math.max(targetWidth, targetHeight),
          useWebWorker: true,
          fileType: 'image/webp',
          initialQuality: 0.8,
        });
      }

      await uploadToStorage(finalBlob, targetWidth, targetHeight, cropFile.originalSize);
      URL.revokeObjectURL(cropFile.objectUrl);
      setCropFile(null);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo procesar la imagen.' });
    } finally {
      setProcessing(false);
    }
  }

  async function uploadToStorage(blob: Blob, width: number, height: number, originalSize: number) {
    setUploading(true);
    setProgress(0);
    setMessage(null);
    const previousStoragePath = storagePath;
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase no esta configurado para gestionar imagenes en este entorno.');
      }

      if (resourceTable === 'site_settings') {
        const { error } = await supabase.from('site_settings').upsert({
          key: resourceId,
          value: imageUrl ?? '',
          type: 'image',
          active: true,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      }

      const form = new FormData();
      form.append('file', blob, 'image.webp');
      form.append('resourceTable', resourceTable);
      form.append('resourceId', resourceId);
      if (folder) form.append('folder', folder);
      form.append('width', String(width));
      form.append('height', String(height));

      const image = await uploadStorageImageWithProgress(form, setProgress);

      try {
        await onImageSaved?.(image);
      } catch (error) {
        try {
          await deleteStorageImage({ storagePath: image.storage_path, resourceTable, resourceId });
        } catch {
          // storage-delete-image records pending cleanup when the object cannot be removed.
        }
        throw new Error(error instanceof Error ? error.message : 'Imagen subida, pero no se pudo actualizar la referencia del recurso.');
      }

      setImageUrl(image.public_url);
      setStoragePath(image.storage_path);

      if (previousStoragePath && previousStoragePath !== image.storage_path) {
        try {
          await deleteStorageImage({ storagePath: previousStoragePath, resourceTable, resourceId });
        } catch {
          setMessage({
            kind: 'warning',
            text: `Nueva imagen guardada (${formatBytes(blob.size)} -> WebP). La imagen anterior queda pendiente de limpieza: ${previousStoragePath}`,
          });
          return;
        }
      }

      if (originalSize > 0) {
        setMessage({
          kind: 'success',
          text: `Imagen guardada en Supabase Storage. Original: ${formatBytes(originalSize)} -> WebP: ${formatBytes(blob.size)}.`,
        });
      } else {
        setMessage({ kind: 'success', text: 'Imagen guardada en Supabase Storage.' });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error al subir la imagen.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!storagePath) return;
    if (requireReplacementToDelete) {
      setMessage({ kind: 'warning', text: 'Esta imagen principal requiere una sustituta antes de eliminarse.' });
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setMessage(null);
    try {
      await deleteStorageImage({ storagePath, resourceTable, resourceId });
      await onImageDeleted?.(storagePath);
      setImageUrl(null);
      setStoragePath(null);
      setConfirmDelete(false);
      setMessage({ kind: 'success', text: 'Imagen eliminada de Supabase Storage.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo eliminar la imagen. La referencia actual se conserva.' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-image-manager">
      <div
        className={`admin-image-manager__preview${dragOver ? ' admin-image-manager__preview--drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label ?? 'Imagen actual'}
            loading="lazy"
            decoding="async"
            style={previewAspect ? ({ '--admin-image-preview-aspect': String(previewAspect) } as CSSProperties) : undefined}
          />
        ) : (
          <div className="admin-image-manager__empty">
            <ImagePlus size={28} />
            <span>Arrastra una imagen aquí o elige un archivo</span>
          </div>
        )}
        {uploading ? <div className="admin-image-manager__overlay"><Loader2 className="animate-spin" size={22} />Subiendo {progress}%</div> : null}
      </div>

      {imageUrl && storagePath ? (
        <p className="admin-image-manager__path" title={storagePath}>{storagePath}</p>
      ) : null}

      <div className="admin-image-manager__actions">
        <label className="admin-btn admin-btn--secondary admin-image-manager__pick" role="button" tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <UploadCloud size={16} /> {imageUrl ? 'Reemplazar imagen' : 'Subir imagen'}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Elegir archivo de imagen"
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {imageUrl && storagePath && !requireReplacementToDelete ? (
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

      <Modal open={Boolean(cropFile)} onClose={() => cropFile && !processing && setCropFile(null)} titleId="image-crop-title" className="max-w-2xl">
        <div className="admin-modal-shell">
          <header className="admin-modal-header">
            <h2 id="image-crop-title" className="admin-card__title"><Crop size={18} /> Ajustar imagen</h2>
            <button className="admin-icon-btn" type="button" aria-label="Cerrar" disabled={processing} onClick={() => setCropFile(null)}><X size={18} /></button>
          </header>
          <div className="admin-modal-body">
            <p className="admin-muted">Recorta y luego se guardará en WebP comprimido.</p>
            {cropFile ? (
              <div className="admin-image-crop">
                <Cropper
                  image={cropFile.objectUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
            ) : null}
            <div className="admin-image-crop__meta">
              <span>Original: {cropFile ? formatBytes(cropFile.originalSize) : '-'}</span>
              <span>Zoom: {Math.round(zoom * 100)}%</span>
              <div className="admin-image-crop__zoom">
                <RotateCcw size={15} aria-hidden />
                <input type="range" min={1} max={3} step={0.05} value={zoom}
                  aria-label="Zoom del recorte"
                  onChange={(event) => setZoom(Number(event.target.value))} />
              </div>
            </div>
          </div>
          <ModalFooter>
            <button className="admin-btn admin-btn--ghost" type="button" disabled={processing} onClick={() => setCropFile(null)}>Cancelar</button>
            <button className="admin-btn" type="button" disabled={processing || !croppedAreaPixels} onClick={() => void confirmCrop()}>
              {processing ? <Loader2 className="animate-spin" size={16} /> : <UploadCloud size={16} />}
              {processing ? 'Procesando...' : 'Continuar y subir'}
            </button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}
