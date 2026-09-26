import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { AdminMediaPreview } from './AdminMediaKit';
import { AdminBadge } from './AdminPrimitives';

export interface AdminImageSlotItem {
  id: string;
  url: string;
  alt?: string | null;
  /** The cover photo (first one): gets the "Portada" badge. */
  cover?: boolean;
  /** Reference-only photo (legacy format): shown, but it cannot be changed or removed here. */
  locked?: boolean;
}

/** What the slot hands to its image manager (`AdminImageManager`) so the picker looks and is named the same everywhere. */
export interface AdminImageSlotPicker {
  variant: 'trigger';
  uploadLabel: string;
  changeLabel: string;
  disabled: boolean;
}

/**
 * The photo gallery of Tours AND Botes: six slots, each with "Foto N" (+ "Portada" on the cover), the photo in the shared media
 * preview frame, and a footer with the PRIMARY picker — icon-only Upload while the slot is empty, "Cambiar" once it has a photo —
 * and the delete icon. Picking a file goes straight to the "Ajustar imagen" dialog (which closes with its own X), so nothing ever
 * opens or grows inside the slot: every card keeps the same size. One component so both screens look and behave the same; each
 * screen supplies its own storage logic through `renderManager`.
 */
export default function AdminImageSlots(props: {
  images: AdminImageSlotItem[];
  slots?: number;
  onDelete: (image: AdminImageSlotItem) => void;
  renderManager: (slot: number, image: AdminImageSlotItem | undefined, picker: AdminImageSlotPicker) => ReactNode;
  fallbackAlt: (slot: number) => string;
  /** Empty slots that can be filled right now (Botes appends photos, so only the first empty one). Default: all. */
  canFill?: (slot: number) => boolean;
}) {
  const total = props.slots ?? 6;
  return (
    <div className="admin-tour-image-slots">
      {Array.from({ length: total }, (_, index) => {
        const image = props.images[index];
        const fillable = props.canFill ? props.canFill(index) : true;
        const picker: AdminImageSlotPicker = { variant: 'trigger', uploadLabel: `Subir foto ${index + 1}`, changeLabel: `Cambiar foto ${index + 1}`, disabled: image ? false : !fillable };
        return (
          <article className="admin-tour-image-slot" key={index}>
            <header><strong>Foto {index + 1}</strong>{image?.cover ? <AdminBadge value="Portada" /> : null}</header>
            <AdminMediaPreview kind="image">
              {image ? <img src={image.url} alt={image.alt || props.fallbackAlt(index)} loading="lazy" decoding="async" /> : undefined}
            </AdminMediaPreview>
            <footer>
              {image?.locked ? null : props.renderManager(index, image, picker)}
              {image && !image.locked ? <button className="admin-icon-btn" type="button" title={`Eliminar foto ${index + 1}`} aria-label={`Eliminar foto ${index + 1}`} onClick={() => props.onDelete(image)}><Trash2 size={15} /></button> : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
