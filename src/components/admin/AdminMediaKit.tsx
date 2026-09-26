import { ImagePlus, Loader2, UploadCloud, Video as VideoIcon } from 'lucide-react';
import type { DragEventHandler, HTMLAttributes, KeyboardEvent, MutableRefObject, ReactNode } from 'react';

/**
 * The ONE preview frame of every Admin media editor (Portada, Sobre Nosotros, Galería, and the photo slots of Tours and Botes):
 * same box, same ratio, same background and border, and the media is always CONTAINED and centered (never stretched or cut).
 * `kind` only decides the empty-state icon; an image, a video (with its player) or a poster all go inside `children`.
 */
export function AdminMediaPreview(props: {
  children?: ReactNode;
  kind?: 'image' | 'video';
  /** Text of the empty state. Omit it for an icon-only placeholder. */
  emptyText?: string;
  dragOver?: boolean;
  disabled?: boolean;
  /** Upload progress (0-100) while a file is being sent: shows the shared overlay. */
  uploadingProgress?: number | null;
  className?: string;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}) {
  const Icon = props.kind === 'video' ? VideoIcon : ImagePlus;
  const classes = ['admin-media-preview', props.dragOver ? 'admin-media-preview--drag' : '', props.className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes} aria-disabled={props.disabled || undefined} onDragOver={props.onDragOver} onDragLeave={props.onDragLeave} onDrop={props.onDrop}>
      {props.children ?? (
        <div className="admin-media-preview__empty">
          <Icon size={26} aria-hidden="true" />
          {props.emptyText ? <span>{props.emptyText}</span> : null}
        </div>
      )}
      {props.uploadingProgress != null ? <div className="admin-media-preview__overlay"><Loader2 className="animate-spin" size={22} />Subiendo {props.uploadingProgress}%</div> : null}
    </div>
  );
}

/**
 * The one "pick a file" button of every media editor. It is the PRIMARY action of the editor: with no media yet it is icon-only
 * (Upload icon, named by aria-label/title); with media it reads "Cambiar". A label + hidden input, so it works as a real file
 * picker and stays keyboard accessible (Enter / Space).
 */
export function AdminFilePicker(props: {
  hasMedia: boolean;
  accept: string;
  inputRef: MutableRefObject<HTMLInputElement | null>;
  inputLabel: string;
  /** Accessible name when there is no media yet, e.g. "Subir imagen". */
  uploadLabel: string;
  /** Accessible name when there is media, e.g. "Cambiar foto 2". Defaults to the visible text. */
  changeLabel?: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  className?: string;
}) {
  const name = props.hasMedia ? (props.changeLabel ?? 'Cambiar') : props.uploadLabel;
  const onKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (!props.disabled && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      props.inputRef.current?.click();
    }
  };
  return (
    <label
      className={['admin-btn', 'admin-image-manager__pick', props.hasMedia ? '' : 'admin-btn--icon', props.className ?? ''].filter(Boolean).join(' ')}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      aria-disabled={props.disabled || undefined}
      aria-label={name}
      title={name}
      onKeyDown={onKeyDown}
    >
      {props.hasMedia ? 'Cambiar' : <UploadCloud size={18} aria-hidden="true" />}
      <input
        ref={props.inputRef}
        type="file"
        accept={props.accept}
        className="sr-only"
        aria-label={props.inputLabel}
        disabled={props.disabled}
        onChange={(event) => {
          props.onFile(event.target.files?.[0] ?? null);
          // Allow selecting the same file again after changing a photo.
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}

/**
 * The ONE summary card of every media listing (Galeria, Portada, Sobre Nosotros): a 4:3 preview (image or video, always `cover`), the
 * title, an optional muted line, and the footer row with the state on the left and Editar on the right. The Galeria card was the model;
 * the other two lists render exactly this component, so they share size, proportion, radius, background and distribution.
 */
export function AdminMediaCard({ kind = 'image', url, alt = '', emptyText, title, subtitle, footer, className, ...rest }: {
  kind?: 'image' | 'video';
  url?: string | null;
  alt?: string;
  emptyText: string;
  title: ReactNode;
  subtitle?: ReactNode;
  footer: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <article {...rest} className={['admin-media-card', className ?? ''].filter(Boolean).join(' ')}>
      {url ? (
        kind === 'video' ? <video src={url} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} /> : <img src={url} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className="admin-media-card__empty">{emptyText}</div>
      )}
      <div className="admin-media-card__body">
        <strong>{title}</strong>
        <span className="admin-muted admin-media-card__sub">{subtitle}</span>
        <div className="admin-actions">{footer}</div>
      </div>
    </article>
  );
}
