import { ChevronDown, ChevronRight, Eye, FileText, Globe2, Loader2, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminImageManager from '../../components/admin/AdminImageManager';
import AdminVideoManager from '../../components/admin/AdminVideoManager';
import { AdminPageHeader } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { ABOUT_CAROUSEL_DEFAULTS, buildAboutCarouselImages, DEFAULT_ABOUT_SETTINGS } from '../../services/aboutSettings';
import type { StorageImage } from '../../services/imageService';
import { translateAllSiteContent, type TranslateAllSiteContentResult } from '../../services/translationService';

interface SiteSettingRow {
  key: string;
  value: string;
  type: string;
  active: boolean;
}

interface ContentField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'boolean' | 'image' | 'video' | 'media_mode';
  fallback: string;
  aspect?: number;
  maxWidth?: number;
  maxHeight?: number;
}

type Draft = Record<string, string>;

const FALLBACK_HERO_IMAGE = '/images/placeholder-image.jpg';

const HERO_IMAGE_FIELDS: ContentField[] = [
  { key: 'home.hero.image', label: 'Slide 1 - compu', type: 'image', fallback: FALLBACK_HERO_IMAGE, aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  { key: 'home.hero.mobile_image', label: 'Slide 1 - celular', type: 'image', fallback: '', aspect: 4 / 5, maxWidth: 1200, maxHeight: 1500 },
  { key: 'home.hero.slide_2.image', label: 'Slide 2 - compu', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  { key: 'home.hero.slide_2.mobile_image', label: 'Slide 2 - celular', type: 'image', fallback: '', aspect: 4 / 5, maxWidth: 1200, maxHeight: 1500 },
  { key: 'home.hero.slide_3.image', label: 'Slide 3 - compu', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  { key: 'home.hero.slide_3.mobile_image', label: 'Slide 3 - celular', type: 'image', fallback: '', aspect: 4 / 5, maxWidth: 1200, maxHeight: 1500 },
  { key: 'home.hero.slide_4.image', label: 'Slide 4 - compu', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  { key: 'home.hero.slide_4.mobile_image', label: 'Slide 4 - celular', type: 'image', fallback: '', aspect: 4 / 5, maxWidth: 1200, maxHeight: 1500 },
];

// The primary/secondary CTA buttons (label, link, enabled toggle) are
// deliberately NOT in this list — see the CIERRE DE SEGURIDAD pass. They
// control site structure/navigation (where a button goes, whether it shows
// at all), not editorial content, and a wrong value here breaks the booking
// entry point. `Hero.tsx` still reads `home.hero.primary_label.*` /
// `primary_href` / `primary_enabled` (and the secondary equivalents) exactly
// as before — those DB rows and the public rendering are untouched, only the
// Admin's ability to edit them is gone.
const HERO_FIELDS: ContentField[] = [
  { key: 'home.hero.media_mode', label: 'Modo del hero', type: 'media_mode', fallback: 'image' },
  { key: 'home.hero.title.es', label: 'Titulo principal ES', type: 'text', fallback: 'Experimenta el oceano' },
  { key: 'home.hero.title.en', label: 'Titulo principal EN', type: 'text', fallback: 'Experience the Ocean' },
  { key: 'home.hero.eyebrow.es', label: 'Etiqueta ES', type: 'text', fallback: 'Charters privados - Costa Rica' },
  { key: 'home.hero.eyebrow.en', label: 'Etiqueta EN', type: 'text', fallback: 'Private charters - Costa Rica' },
  { key: 'home.hero.subtitle.es', label: 'Subtitulo ES', type: 'textarea', fallback: 'Pesca de clase mundial, vistas impresionantes y recuerdos inolvidables.' },
  { key: 'home.hero.subtitle.en', label: 'Subtitulo EN', type: 'textarea', fallback: 'World-class fishing, stunning views, and unforgettable memories.' },
  { key: 'home.hero.image_alt.es', label: 'Texto alternativo imagen ES', type: 'text', fallback: 'Bote privado navegando en el Pacifico de Costa Rica' },
  { key: 'home.hero.image_alt.en', label: 'Texto alternativo imagen EN', type: 'text', fallback: 'Private boat sailing Costa Rica Pacific waters' },
  { key: 'home.hero.video', label: 'Video de fondo', type: 'video', fallback: '' },
  { key: 'home.hero.mobile_video', label: 'Video de fondo - celular', type: 'video', fallback: '' },
  { key: 'home.hero.video_poster', label: 'Imagen mientras carga el video', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  ...HERO_IMAGE_FIELDS,
];

// Etiqueta (eyebrow) and both button labels are deliberately NOT in this
// list — see the CIERRE DE SEGURIDAD pass. They're structural CTA copy, not
// editorial content, and stay controlled by code.
const ABOUT_FIELDS: ContentField[] = [
  ...Object.entries(ABOUT_CAROUSEL_DEFAULTS).map(([key, fallback], index): ContentField => ({
    key, fallback, label: `Carrusel About - foto ${index + 1}`, type: 'image', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080,
  })),
  // Fallbacks come from DEFAULT_ABOUT_SETTINGS — the exact copy the public
  // page renders while no row exists — so opening this form shows what
  // visitors actually see, and a Guardar without edits can't silently swap
  // the public text for different placeholder copy.
  ...(([
    ['about.title', 'Titulo', 'text'],
    ['about.description', 'Descripcion', 'textarea'],
    ['about.preview_text', 'Texto de inicio (home) - parrafos separados por linea vacia', 'textarea'],
    ['about.story', 'Historia (pagina Nosotros) - parrafos separados por linea vacia', 'textarea'],
    ['about.cta_title', 'Titulo final', 'text'],
    ['about.cta_text', 'Texto final', 'textarea'],
    ['about.image_alt', 'Texto alternativo imagen', 'text'],
  ] as const).flatMap(([base, label, type]): ContentField[] => (['es', 'en'] as const).map((lang) => {
    const key = `${base}.${lang}` as keyof typeof DEFAULT_ABOUT_SETTINGS;
    return { key, label: `${label} ${lang.toUpperCase()}`, type, fallback: DEFAULT_ABOUT_SETTINGS[key] };
  }))),
  { key: 'about.image', label: 'Carrusel About - foto 5 (opcional)', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
];

function storagePathFromPublicUrl(value?: string | null) {
  if (!value) return null;
  if (value.includes('/site-images/')) return value.split('/site-images/')[1] ?? null;
  try {
    const path = decodeURIComponent(new URL(value).pathname.replace(/^\//, ''));
    return /^(boats|tours|gallery|destinations|reviews|general)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

type LangFilter = 'all' | 'es' | 'en';

function fieldLang(key: string): 'es' | 'en' | null {
  if (key.endsWith('.es')) return 'es';
  if (key.endsWith('.en')) return 'en';
  return null;
}

function defaultsFrom(fields: ContentField[]): Draft {
  return fields.reduce<Draft>((acc, field) => {
    acc[field.key] = field.fallback;
    return acc;
  }, {});
}

interface ContentSectionProps {
  title: string;
  description: string;
  fields: ContentField[];
  saveLabel: string;
  imageRequireReplacement?: boolean;
  preview?: (draft: Draft) => React.ReactNode;
  /** Splits this section into "Media" / "Textos" inner tabs so it isn't one long scroll. Save stays unified (one section = one payload). */
  mediaTextTabs?: boolean;
}

function ContentSection({ title, description, fields, saveLabel, imageRequireReplacement = false, preview, mediaTextTabs = false }: ContentSectionProps) {
  const keys = useMemo(() => fields.map((field) => field.key), [fields]);
  const [draft, setDraft] = useState<Draft>(() => defaultsFrom(fields));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [showExtraSlides, setShowExtraSlides] = useState(false);
  const [heroMediaMode, setHeroMediaMode] = useState<'image' | 'video'>('image');
  const [switchingMediaMode, setSwitchingMediaMode] = useState(false);
  const [innerTab, setInnerTab] = useState<'media' | 'texts'>('media');

  const imageFields = useMemo(() => fields.filter((field) => field.type === 'image'), [fields]);
  const primaryImageFields = useMemo(() => imageFields.filter((field) => !field.key.includes('.slide_') && field.key !== 'home.hero.video_poster'), [imageFields]);
  const extraImageFields = useMemo(() => imageFields.filter((field) => field.key.includes('.slide_')), [imageFields]);
  const videoFields = useMemo(() => fields.filter((field) => field.type === 'video'), [fields]);
  const videoPosterField = useMemo(() => fields.find((field) => field.key === 'home.hero.video_poster'), [fields]);
  const textFields = useMemo(
    () => fields.filter((field) => !['image', 'video', 'media_mode'].includes(field.type) && (langFilter === 'all' || fieldLang(field.key) === null || fieldLang(field.key) === langFilter)),
    [fields, langFilter],
  );

  async function loadSettings() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value, type, active')
      .in('key', keys)
      .order('key');

    setLoading(false);
    if (error) {
      setError(error.message);
      setDraft(defaultsFrom(fields));
      return;
    }

    const rows = (data ?? []) as SiteSettingRow[];
    const nextDraft = defaultsFrom(fields);
    rows.forEach((row) => {
      if (row.key in nextDraft && row.value) nextDraft[row.key] = row.value;
    });
    setDraft(nextDraft);
    if (videoFields.length) setHeroMediaMode(nextDraft['home.hero.media_mode'] === 'video' ? 'video' : 'image');
  }

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upsertKey(key: string, value: string, type: string) {
    const { error } = await supabase.from('site_settings').upsert({
      key,
      value,
      type,
      active: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      for (const field of fields) {
        if (field.type === 'image' || field.type === 'video') continue; // saved by their own upload managers
        const raw = draft[field.key];
        const value = field.type === 'boolean' ? (raw !== 'false' ? 'true' : 'false') : ((raw ?? '').trim() || field.fallback);
        await upsertKey(field.key, value, field.type);
      }
      setNotice(`${title} actualizado. La pagina publica usara estos valores sin redesplegar.`);
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el contenido.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageSaved(field: ContentField, image: StorageImage) {
    try {
      await upsertKey(field.key, image.public_url, 'image');
      setNotice('Imagen actualizada.');
      await loadSettings();
    } catch (imageError) {
      throw new Error(imageError instanceof Error ? imageError.message : 'No se pudo guardar la imagen.');
    }
  }

  async function ensureImageSetting(field: ContentField) {
    const { error } = await supabase.from('site_settings').upsert({
      key: field.key, value: draft[field.key] ?? field.fallback, type: 'image', active: true,
    }, { onConflict: 'key', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async function handleImageDeleted(field: ContentField, storagePath: string) {
    try {
      await upsertKey(field.key, field.fallback, 'image');
      setNotice('Imagen eliminada. El sitio vuelve al contenido por defecto.');
      await loadSettings();
    } catch {
      setNotice(`No se pudo actualizar la referencia de la imagen eliminada: ${storagePath}`);
    }
  }

  async function handleVideoSaved(field: ContentField, video: StorageImage) {
    try {
      await upsertKey(field.key, video.public_url, 'video');
      setNotice('Video actualizado.');
      await loadSettings();
    } catch (videoError) {
      throw new Error(videoError instanceof Error ? videoError.message : 'No se pudo guardar el video.');
    }
  }

  async function handleVideoDeleted(field: ContentField, storagePath: string) {
    try {
      await upsertKey(field.key, field.fallback, 'video');
      setNotice('Video eliminado. El sitio vuelve al contenido por defecto.');
      await loadSettings();
    } catch {
      setNotice(`No se pudo actualizar la referencia del video eliminado: ${storagePath}`);
    }
  }

  function updateDraft(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function switchHeroMediaMode(mode: 'image' | 'video') {
    if (mode === heroMediaMode) return;
    setSwitchingMediaMode(true);
    try {
      await upsertKey('home.hero.media_mode', mode, 'media_mode');
      setDraft((current) => ({ ...current, 'home.hero.media_mode': mode }));
      setHeroMediaMode(mode);
      setNotice(`Modo del Hero cambiado a ${mode === 'video' ? 'video' : 'imagenes'}. Los videos guardados se conservaron.`);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'No se pudo cambiar el modo del Hero.');
    } finally {
      setSwitchingMediaMode(false);
    }
  }

  return (
    <section className="admin-card">
      <h2 className="admin-card__title"><FileText size={18} /> {title}</h2>
      <p className="admin-muted mb-4">{description}</p>
      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}
      {loading ? (
        <p className="admin-muted">Cargando contenido...</p>
      ) : (
        <div className="grid gap-5">
          {mediaTextTabs ? (
            <nav className="admin-tabs" aria-label={`Secciones de ${title}`}>
              <button type="button" className={`admin-tab${innerTab === 'media' ? ' admin-tab--active' : ''}`} onClick={() => setInnerTab('media')}>Media</button>
              <button type="button" className={`admin-tab${innerTab === 'texts' ? ' admin-tab--active' : ''}`} onClick={() => setInnerTab('texts')}>Textos</button>
            </nav>
          ) : null}

          <div style={mediaTextTabs && innerTab !== 'media' ? { display: 'none' } : undefined} className="grid gap-5">
          {videoFields.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="admin-muted font-extrabold">Fondo del Hero</p>
              <div className="admin-segmented" role="group" aria-label="Tipo de fondo del Hero">
                <button
                  type="button"
                  className={heroMediaMode === 'image' ? 'admin-segmented__option--active' : ''}
                  disabled={switchingMediaMode}
                  onClick={() => void switchHeroMediaMode('image')}
                >
                  Imágenes
                </button>
                <button
                  type="button"
                  className={heroMediaMode === 'video' ? 'admin-segmented__option--active' : ''}
                  disabled={switchingMediaMode}
                  onClick={() => void switchHeroMediaMode('video')}
                >
                  Video
                </button>
              </div>
            </div>
          ) : null}

          {(videoFields.length === 0 || heroMediaMode === 'image') && primaryImageFields.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {primaryImageFields.map((imageField) => (
                <div className="admin-media-field" key={imageField.key}>
                  <p className="admin-media-field__label">{imageField.label}</p>
                  <AdminImageManager
                    resourceTable="site_settings"
                    resourceId={imageField.key}
                    folder="general"
                    currentImageUrl={draft[imageField.key]}
                    currentStoragePath={storagePathFromPublicUrl(draft[imageField.key])}
                    label={draft[`${imageField.key.replace(/\.mobile_image$/, '').replace(/\.image$/, '')}.image_alt.es`] ?? imageField.label}
                    aspect={imageField.aspect ?? 16 / 9}
                    previewAspect={imageField.aspect ?? 16 / 9}
                    maxWidth={imageField.maxWidth ?? 1920}
                    maxHeight={imageField.maxHeight ?? 1080}
                    maxSizeMB={0.9}
                    beforeUpload={() => ensureImageSetting(imageField)}
                    requireReplacementToDelete={imageRequireReplacement && Boolean(imageField.fallback)}
                    onImageSaved={(image) => handleImageSaved(imageField, image)}
                    onImageDeleted={(storagePath) => handleImageDeleted(imageField, storagePath)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {(videoFields.length === 0 || heroMediaMode === 'image') && extraImageFields.length > 0 ? (
            <div className="grid gap-3">
              <button
                className="admin-btn admin-btn--ghost"
                type="button"
                onClick={() => setShowExtraSlides((current) => !current)}
                style={{ justifySelf: 'start' }}
              >
                {showExtraSlides ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showExtraSlides ? 'Ocultar diapositivas adicionales' : `Mostrar diapositivas adicionales (${extraImageFields.length})`}
              </button>
              {showExtraSlides ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  {extraImageFields.map((imageField) => (
                    <div className="admin-media-field" key={imageField.key}>
                      <p className="admin-media-field__label">{imageField.label}</p>
                      <AdminImageManager
                        resourceTable="site_settings"
                        resourceId={imageField.key}
                        folder="general"
                        currentImageUrl={draft[imageField.key]}
                        currentStoragePath={storagePathFromPublicUrl(draft[imageField.key])}
                        label={draft[`${imageField.key.replace(/\.mobile_image$/, '').replace(/\.image$/, '')}.image_alt.es`] ?? imageField.label}
                        aspect={imageField.aspect ?? 16 / 9}
                        previewAspect={imageField.aspect ?? 16 / 9}
                        maxWidth={imageField.maxWidth ?? 1920}
                        maxHeight={imageField.maxHeight ?? 1080}
                        maxSizeMB={0.9}
                        requireReplacementToDelete={imageRequireReplacement && Boolean(imageField.fallback)}
                        onImageSaved={(image) => handleImageSaved(imageField, image)}
                        onImageDeleted={(storagePath) => handleImageDeleted(imageField, storagePath)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {videoFields.length > 0 && heroMediaMode === 'video' ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {videoFields.map((videoField) => (
                <div className="admin-media-field" key={videoField.key}>
                  <p className="admin-media-field__label">{videoField.label}</p>
                  <AdminVideoManager
                    resourceTable="site_settings"
                    resourceId={videoField.key}
                    folder="general"
                    currentVideoUrl={draft[videoField.key]}
                    currentStoragePath={storagePathFromPublicUrl(draft[videoField.key])}
                    label={videoField.label}
                    onVideoSaved={(video) => handleVideoSaved(videoField, video)}
                    onVideoDeleted={(storagePath) => handleVideoDeleted(videoField, storagePath)}
                  />
                </div>
              ))}
              {videoPosterField ? (
                <div className="admin-media-field" key={videoPosterField.key}>
                  <p className="admin-media-field__label">{videoPosterField.label}</p>
                  <AdminImageManager
                    resourceTable="site_settings"
                    resourceId={videoPosterField.key}
                    folder="general"
                    currentImageUrl={draft[videoPosterField.key]}
                    currentStoragePath={storagePathFromPublicUrl(draft[videoPosterField.key])}
                    label={videoPosterField.label}
                    aspect={videoPosterField.aspect ?? 16 / 9}
                    previewAspect={videoPosterField.aspect ?? 16 / 9}
                    maxWidth={videoPosterField.maxWidth ?? 1920}
                    maxHeight={videoPosterField.maxHeight ?? 1080}
                    maxSizeMB={0.9}
                    onImageSaved={(image) => handleImageSaved(videoPosterField, image)}
                    onImageDeleted={(storagePath) => handleImageDeleted(videoPosterField, storagePath)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          </div>

          <div style={mediaTextTabs && innerTab !== 'texts' ? { display: 'none' } : undefined} className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="admin-muted font-extrabold">Textos</p>
            <div className="admin-segmented" role="group" aria-label="Filtrar por idioma">
              {(['all', 'es', 'en'] as LangFilter[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={langFilter === lang ? 'admin-segmented__option--active' : ''}
                  onClick={() => setLangFilter(lang)}
                >
                  {lang === 'all' ? 'Todos' : lang === 'es' ? 'Español' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {textFields.map((field) => (
              field.type === 'boolean' ? (
                <label className="flex items-center gap-2" key={field.key}>
                  <input
                    type="checkbox"
                    checked={draft[field.key] !== 'false'}
                    onChange={(event) => updateDraft(field.key, String(event.target.checked))}
                  />
                  <span className="admin-muted">{field.label}</span>
                </label>
              ) : (
                <label className="grid gap-1" key={field.key}>
                  <span className="admin-muted">{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea className="admin-input min-h-24" value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} />
                  ) : (
                    <input className="admin-input" value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} />
                  )}
                </label>
              )
            ))}
          </div>

          {preview ? (
            <div className="rounded-2xl border border-white/70 bg-ocean-950 p-4 text-white shadow-soft">
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-300"><Eye size={14} /> Vista previa</p>
              {preview(draft)}
            </div>
          ) : null}
          </div>

          <div className="admin-image-manager__actions">
            <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveSettings()}>
              <Save size={16} /> {saving ? 'Guardando...' : saveLabel}
            </button>
            <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void loadSettings()}>Descartar cambios</button>
          </div>
        </div>
      )}
    </section>
  );
}

// The site's single "Traducir todo el sitio" button. Covers tours, packages,
// inclusions, boats, gallery, payment methods, departure locations, Hero/
// About sections and reviews in one call — see translate-all-site-content.
// Always visible regardless of the Hero/About tab above, since its scope is
// the whole site, not just this page's two sections.
function TranslateAllSiteContentCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TranslateAllSiteContentResult | null>(null);

  async function run() {
    setRunning(true);
    setError('');
    try {
      const response = await translateAllSiteContent();
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la traducción del sitio.');
      setResult(null);
    } finally {
      setRunning(false);
      setConfirmOpen(false);
    }
  }

  return (
    <section className="admin-card">
      <h2 className="admin-card__title"><Globe2 size={18} /> Traducción automática</h2>
      <p className="admin-muted mb-4">
        Traduce con un clic el contenido del sitio que todavía no tenga versión en español o inglés: tours, paquetes,
        inclusiones, botes, galería, métodos de pago, ubicaciones de salida, estas secciones y comentarios. Las
        traducciones ya existentes (manuales o automáticas) nunca se sobrescriben.
      </p>

      <button className="admin-btn" type="button" disabled={running} onClick={() => setConfirmOpen(true)}>
        {running ? <Loader2 className="animate-spin" size={16} /> : <Globe2 size={16} />}
        {running ? 'Traduciendo contenido...' : 'Traducir todo el sitio'}
      </button>

      {error ? <div className="admin-alert admin-alert--danger mt-4">{error}</div> : null}

      {result ? (
        <div className="admin-alert admin-alert--success mt-4">
          <p className="font-extrabold">Traducción completada</p>
          <ul className="mt-2 space-y-1 text-sm">
            {result.results.map((entry) => (
              <li key={entry.table}>
                {entry.label}: {entry.updated} actualizado{entry.updated === 1 ? '' : 's'}
                {entry.skipped ? `, ${entry.skipped} sin cambios` : ''}
                {entry.errors ? `, ${entry.errors} con errores` : ''}
              </li>
            ))}
          </ul>
          {result.hasMore ? (
            <p className="mt-2 text-sm">Quedan comentarios pendientes por traducir — pulsa el botón de nuevo para continuar.</p>
          ) : null}
        </div>
      ) : null}

      <AdminConfirmDialog
        open={confirmOpen}
        onClose={() => (running ? undefined : setConfirmOpen(false))}
        onConfirm={run}
        loading={running}
        titleId="translate-all-site-title"
        title="Traducir todo el sitio"
        tone="primary"
        confirmLabel="Traducir"
        message={<p>Se traducirá automáticamente el contenido que todavía no tenga versión en español o inglés. Las traducciones existentes no se sobrescribirán.</p>}
      />
    </section>
  );
}

type ContentTab = 'hero' | 'about';

export default function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<ContentTab>('hero');

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Hero Section"
        description="Administra el hero del inicio y la pagina Nosotros sin cambiar codigo."
        actions={<span />}
      />

      <nav className="admin-tabs" aria-label="Secciones de contenido editable">
        <button type="button" className={`admin-tab${activeTab === 'hero' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('hero')}>
          Hero Section
        </button>
        <button type="button" className={`admin-tab${activeTab === 'about' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('about')}>
          Nosotros / About
        </button>
      </nav>

      <TranslateAllSiteContentCard />

      <div style={{ display: activeTab === 'hero' ? undefined : 'none' }}>
      <ContentSection
        title="Hero Section"
        description="La imagen administrada es el fondo principal del hero. El archivo de video queda conservado, pero no bloquea el contenido editable."
        fields={HERO_FIELDS}
        saveLabel="Guardar hero"
        imageRequireReplacement
        mediaTextTabs
        preview={(draft) => (
          <div className="relative overflow-hidden rounded-xl">
            {draft['home.hero.mobile_image'] ? (
              <img className="aspect-[4/5] w-full object-cover sm:hidden" src={draft['home.hero.mobile_image']} alt={draft['home.hero.image_alt.es']} />
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center border border-dashed border-white/25 text-xs text-white/60 sm:hidden">
                Sin imagen de celular
              </div>
            )}
            {draft['home.hero.image'] ? (
              <img className="hidden aspect-video w-full object-cover sm:block" src={draft['home.hero.image']} alt={draft['home.hero.image_alt.es']} />
            ) : (
              <div className="hidden aspect-video w-full place-items-center border border-dashed border-white/25 text-xs text-white/60 sm:grid">
                Sin imagen de compu
              </div>
            )}
            <div className="absolute inset-0 bg-ocean-950/45" />
            <div className="absolute inset-0 grid place-items-center p-5 text-center">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/75">{draft['home.hero.eyebrow.es']}</p>
                <h3 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-5xl">{draft['home.hero.title.es']}</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-white/80 sm:text-base">{draft['home.hero.subtitle.es']}</p>
              </div>
            </div>
          </div>
        )}
      />
      </div>

      <div style={{ display: activeTab === 'about' ? undefined : 'none' }}>
      <ContentSection
        title="Nosotros / About"
        description="Cambia cada foto del carrusel de Sobre nosotros. Se muestran en orden del 1 al 5 y cambian automáticamente. La quinta foto es opcional."
        fields={ABOUT_FIELDS}
        saveLabel="Guardar Nosotros"
        preview={(draft) => (
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <h3 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{draft['about.title.es']}</h3>
              <p className="mt-3 text-sm leading-6 text-white/80">{draft['about.preview_text.es'].split('\n')[0]}</p>
            </div>
            {buildAboutCarouselImages(draft).length ? (
              <div className="grid grid-cols-2 gap-2">{buildAboutCarouselImages(draft).map((src, index) => <img key={src} className="aspect-video w-full rounded-xl object-cover" src={src} alt={`Foto ${index + 1}`} />)}</div>
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-white/25 text-xs text-white/60">
                Sin imagen gestionada (usa fotos por defecto)
              </div>
            )}
          </div>
        )}
      />
      </div>
    </div>
  );
}
