import { useEffect, useState } from 'react';

import { resolveHeroMedia } from '../../utils/heroMedia';

type Device = 'desktop' | 'mobile';

const DEVICE_LABELS: Record<Device, string> = { desktop: 'Computadora', mobile: 'Celular' };

// Same title split the public Hero uses: first word on its own line, the rest below.
function splitTitle(title: string) {
  const [lead, ...rest] = title.trim().split(/\s+/);
  return { lead: lead || title, tail: rest.join(' ') };
}

/**
 * Compact preview of the home Hero for the Portada screen. The media comes from the same resolver as the landing
 * (utils/heroMedia.ts): video mode plays the configured background video (poster while it loads / if it cannot play), image mode shows the
 * first slide, each for the chosen context (computer or phone) — nothing is invented when a context has no media. The overlay
 * and the text block mirror the public Hero at a small scale; the CTA buttons and social icons are not editable, so they are left out.
 */
export default function AdminHeroPreview({ draft }: { draft: Record<string, string> }) {
  const [device, setDevice] = useState<Device>('desktop');
  const [failedVideo, setFailedVideo] = useState('');
  const [playingVideo, setPlayingVideo] = useState('');
  const media = resolveHeroMedia(draft, device === 'mobile');
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const showVideo = media.videoMode && Boolean(media.videoUrl) && !reduceMotion && failedVideo !== media.videoUrl;
  const still = media.videoMode ? media.poster : media.imageUrl;
  const eyebrow = draft['home.hero.eyebrow.en'];
  const title = splitTitle(draft['home.hero.title.en'] ?? '');
  const subtitle = draft['home.hero.subtitle.en'];
  const alt = draft['home.hero.image_alt.en'] ?? '';
  const source = media.videoMode ? (media.videoUrl ? 'Video de fondo' : still ? 'Imagen mientras carga el video' : 'Video de fondo') : 'Imagen de fondo';

  useEffect(() => { setFailedVideo(''); }, [media.videoUrl]);

  return (
    <div className="admin-hero-preview">
      <div className="admin-hero-preview__bar">
        <div className="admin-segmented" role="group" aria-label="Contexto de la vista previa">
          {(['desktop', 'mobile'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={device === value} className={device === value ? 'admin-segmented__option--active' : ''} onClick={() => setDevice(value)}>
              {DEVICE_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="admin-hero-preview__source">{source} · {DEVICE_LABELS[device].toLowerCase()}</p>
      </div>
      <div className={`admin-hero-preview__frame admin-hero-preview__frame--${device}`} data-media={showVideo ? 'video' : still ? 'image' : 'none'}>
        {still ? <img className="admin-hero-preview__media" src={still} alt={media.videoMode ? '' : alt} aria-hidden={media.videoMode ? true : undefined} /> : null}
        {showVideo ? (
          <video
            key={media.videoUrl}
            className="admin-hero-preview__media admin-hero-preview__video"
            style={{ opacity: playingVideo === media.videoUrl ? 1 : 0 }}
            src={media.videoUrl}
            poster={media.poster || undefined}
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            preload="auto"
            aria-hidden="true"
            onPlaying={() => setPlayingVideo(media.videoUrl)}
            onPause={() => setPlayingVideo('')}
            onError={() => setFailedVideo(media.videoUrl)}
          />
        ) : null}
        {!still && !showVideo ? (
          <div className="admin-hero-preview__empty">{media.videoMode ? 'Sin video ni imagen configurados' : `Sin imagen de ${device === 'mobile' ? 'celular' : 'computadora'}`}</div>
        ) : null}
        <div className="admin-hero-preview__overlay" aria-hidden="true" />
        <div className="admin-hero-preview__text">
          {eyebrow ? <p className="admin-hero-preview__eyebrow">{eyebrow}</p> : null}
          <p className="admin-hero-preview__title" role="heading" aria-level={3}>
            <span>{title.lead}</span>
            {title.tail ? <span>{title.tail}</span> : null}
          </p>
          {subtitle ? <p className="admin-hero-preview__subtitle">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
