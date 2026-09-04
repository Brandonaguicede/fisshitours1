import { ChevronDown, ChevronRight, Eye, FileText, Image as ImageIcon, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import AdminVideoManager from '../../components/admin/AdminVideoManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import { deleteStorageImage, type StorageImage } from '../../services/imageService';

interface SiteSettingRow {
  key: string;
  value: string;
  type: string;
  active: boolean;
}

interface ContentField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'boolean' | 'image' | 'video';
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

const HERO_FIELDS: ContentField[] = [
  { key: 'home.hero.title.es', label: 'Titulo principal ES', type: 'text', fallback: 'Experimenta el oceano' },
  { key: 'home.hero.title.en', label: 'Titulo principal EN', type: 'text', fallback: 'Experience the Ocean' },
  { key: 'home.hero.eyebrow.es', label: 'Etiqueta ES', type: 'text', fallback: 'Charters privados - Costa Rica' },
  { key: 'home.hero.eyebrow.en', label: 'Etiqueta EN', type: 'text', fallback: 'Private charters - Costa Rica' },
  { key: 'home.hero.subtitle.es', label: 'Subtitulo ES', type: 'textarea', fallback: 'Pesca de clase mundial, vistas impresionantes y recuerdos inolvidables.' },
  { key: 'home.hero.subtitle.en', label: 'Subtitulo EN', type: 'textarea', fallback: 'World-class fishing, stunning views, and unforgettable memories.' },
  { key: 'home.hero.primary_label.es', label: 'Boton principal ES', type: 'text', fallback: 'Reservar ahora' },
  { key: 'home.hero.primary_label.en', label: 'Boton principal EN', type: 'text', fallback: 'Book now' },
  { key: 'home.hero.primary_href', label: 'Enlace boton principal', type: 'url', fallback: '#booking' },
  { key: 'home.hero.secondary_label.es', label: 'Boton secundario ES', type: 'text', fallback: 'Ver tours' },
  { key: 'home.hero.secondary_label.en', label: 'Boton secundario EN', type: 'text', fallback: 'View tours' },
  { key: 'home.hero.secondary_href', label: 'Enlace boton secundario', type: 'url', fallback: '#tours' },
  { key: 'home.hero.image_alt.es', label: 'Texto alternativo imagen ES', type: 'text', fallback: 'Bote privado navegando en el Pacifico de Costa Rica' },
  { key: 'home.hero.image_alt.en', label: 'Texto alternativo imagen EN', type: 'text', fallback: 'Private boat sailing Costa Rica Pacific waters' },
  { key: 'home.hero.video', label: 'Video de fondo', type: 'video', fallback: '' },
  { key: 'home.hero.video_poster', label: 'Imagen mientras carga el video', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
  ...HERO_IMAGE_FIELDS,
  { key: 'home.hero.primary_enabled', label: 'Activar boton principal', type: 'boolean', fallback: 'true' },
  { key: 'home.hero.secondary_enabled', label: 'Activar boton secundario', type: 'boolean', fallback: 'true' },
];

const ABOUT_FIELDS: ContentField[] = [
  { key: 'about.eyebrow.es', label: 'Etiqueta ES', type: 'text', fallback: 'Sobre nosotros' },
  { key: 'about.eyebrow.en', label: 'Etiqueta EN', type: 'text', fallback: 'About us' },
  { key: 'about.title.es', label: 'Titulo ES', type: 'text', fallback: 'Pasion local y excelencia en el Pacifico de Costa Rica' },
  { key: 'about.title.en', label: 'Titulo EN', type: 'text', fallback: 'Local passion and excellence on Costa Rica Pacific' },
  { key: 'about.description.es', label: 'Descripcion del hero ES', type: 'textarea', fallback: 'Sube a bordo de Second Wind y descubre una experiencia sofisticada donde el lujo se encuentra con la naturaleza.' },
  { key: 'about.description.en', label: 'Descripcion del hero EN', type: 'textarea', fallback: 'Step aboard Second Wind and discover a sophisticated ocean experience where luxury meets nature.' },
  { key: 'about.preview_text.es', label: 'Texto de inicio (home) ES - parrafos separados por linea vacia', type: 'textarea', fallback: 'Papagayo Fishing Tour es una empresa familiar fundada por los jovenes emprendedores locales Gabriel y Joshua, orgullosamente de Playas del Coco.\n\nCada salida esta disenada con cuidado para ofrecer exclusividad, comodidad y autenticidad en las aguas de la Peninsula de Papagayo.' },
  { key: 'about.preview_text.en', label: 'Texto de inicio (home) EN - parrafos separados por linea vacia', type: 'textarea', fallback: 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco.\n\nEvery journey is thoughtfully designed to deliver exclusivity, comfort and authenticity across the waters of the Papagayo Peninsula.' },
  { key: 'about.story.es', label: 'Historia (pagina Nosotros) ES - parrafos separados por linea vacia', type: 'textarea', fallback: 'Papagayo Fishing Tour es una empresa familiar fundada por los jovenes emprendedores locales Gabriel y Joshua, orgullosamente de Playas del Coco. Su conexion profunda con el oceano redefine las experiencias de pesca en las aguas de la Peninsula de Papagayo.\n\nNavega por mares cristalinos reconocidos por pesca, surf y snorkeling de clase mundial. Cada viaje esta disenado para ofrecer exclusividad, comodidad y autenticidad.' },
  { key: 'about.story.en', label: 'Historia (pagina Nosotros) EN - parrafos separados por linea vacia', type: 'textarea', fallback: 'Papagayo Fishing Tour is a family-owned company founded by young local entrepreneurs Gabriel and Joshua, proudly from Playas del Coco. Driven by a deep connection to the ocean, they have redefined fishing experiences in the waters of the Papagayo Peninsula.\n\nSail across crystal-clear seas renowned for world-class fishing, surfing and snorkeling. Every journey is thoughtfully designed to deliver exclusivity, comfort and authenticity.' },
  { key: 'about.cta_title.es', label: 'Titulo final ES', type: 'text', fallback: 'Listo para planear tu salida?' },
  { key: 'about.cta_title.en', label: 'Titulo final EN', type: 'text', fallback: 'Ready to plan your trip?' },
  { key: 'about.cta_text.es', label: 'Texto final ES', type: 'textarea', fallback: 'Elige tu barco, horario y tipo de experiencia. Nosotros nos encargamos del resto.' },
  { key: 'about.cta_text.en', label: 'Texto final EN', type: 'textarea', fallback: 'Choose your boat, time and experience. We handle the rest.' },
  { key: 'about.preview_button_label.es', label: 'Boton en inicio ES', type: 'text', fallback: 'Conocer la empresa' },
  { key: 'about.preview_button_label.en', label: 'Boton en inicio EN', type: 'text', fallback: 'Meet the company' },
  { key: 'about.cta_button_label.es', label: 'Boton final ES', type: 'text', fallback: 'Reservar ahora' },
  { key: 'about.cta_button_label.en', label: 'Boton final EN', type: 'text', fallback: 'Book now' },
  { key: 'about.image_alt.es', label: 'Texto alternativo imagen ES', type: 'text', fallback: 'Tripulacion con pesca en aguas de Guanacaste' },
  { key: 'about.image_alt.en', label: 'Texto alternativo imagen EN', type: 'text', fallback: 'Crew with a catch in Guanacaste waters' },
  { key: 'about.image', label: 'Imagen principal de Nosotros', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
];

function storagePathFromPublicUrl(value?: string | null) {
  if (!value?.includes('/site-images/')) return null;
  return value.split('/site-images/')[1] ?? null;
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
}

function ContentSection({ title, description, fields, saveLabel, imageRequireReplacement = false, preview }: ContentSectionProps) {
  const keys = useMemo(() => fields.map((field) => field.key), [fields]);
  const [settings, setSettings] = useState<SiteSettingRow[]>([]);
  const [draft, setDraft] = useState<Draft>(() => defaultsFrom(fields));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [showExtraSlides, setShowExtraSlides] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [heroMediaMode, setHeroMediaMode] = useState<'image' | 'video'>('image');
  const [switchingMediaMode, setSwitchingMediaMode] = useState(false);

  const rowsByKey = useMemo(() => new Map(settings.map((setting) => [setting.key, setting])), [settings]);
  const imageFields = useMemo(() => fields.filter((field) => field.type === 'image'), [fields]);
  const primaryImageFields = useMemo(() => imageFields.filter((field) => !field.key.includes('.slide_') && field.key !== 'home.hero.video_poster'), [imageFields]);
  const extraImageFields = useMemo(() => imageFields.filter((field) => field.key.includes('.slide_')), [imageFields]);
  const videoFields = useMemo(() => fields.filter((field) => field.type === 'video'), [fields]);
  const videoPosterField = useMemo(() => fields.find((field) => field.key === 'home.hero.video_poster'), [fields]);
  const textFields = useMemo(
    () => fields.filter((field) => field.type !== 'image' && field.type !== 'video' && (langFilter === 'all' || fieldLang(field.key) === null || fieldLang(field.key) === langFilter)),
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
      setSettings([]);
      setDraft(defaultsFrom(fields));
      return;
    }

    const rows = (data ?? []) as SiteSettingRow[];
    const nextDraft = defaultsFrom(fields);
    rows.forEach((row) => {
      if (row.key in nextDraft && row.value) nextDraft[row.key] = row.value;
    });
    setSettings(rows);
    setDraft(nextDraft);
    if (videoFields.length) setHeroMediaMode(nextDraft[videoFields[0].key] ? 'video' : 'image');
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
        const raw = draft[field.key];
        const value = field.type === 'boolean'
          ? (raw !== 'false' ? 'true' : 'false')
          : ((raw ?? '').trim() || field.fallback);
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
    const videoField = videoFields[0];
    const currentVideoUrl = videoField ? draft[videoField.key] : '';
    if (mode === 'image' && videoField && currentVideoUrl) {
      // The Hero always prefers a configured video over the image slideshow, so
      // switching back to "Imágenes" has to actually clear it, not just hide the field.
      setSwitchingMediaMode(true);
      try {
        await upsertKey(videoField.key, videoField.fallback, 'video');
        const storagePath = storagePathFromPublicUrl(currentVideoUrl);
        if (storagePath) {
          await deleteStorageImage({ storagePath, resourceTable: 'site_settings', resourceId: videoField.key }).catch(() => undefined);
        }
        setNotice('Video eliminado. El Hero vuelve a mostrar las imágenes.');
        await loadSettings();
      } catch (switchError) {
        setError(switchError instanceof Error ? switchError.message : 'No se pudo quitar el video actual.');
        setSwitchingMediaMode(false);
        return;
      }
      setSwitchingMediaMode(false);
    }
    setHeroMediaMode(mode);
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
                <div className="grid gap-2" key={imageField.key}>
                  <p className="admin-muted font-extrabold">{imageField.label}</p>
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
                    <div className="grid gap-2" key={imageField.key}>
                      <p className="admin-muted font-extrabold">{imageField.label}</p>
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
                <div className="grid gap-2" key={videoField.key}>
                  <p className="admin-muted font-extrabold">{videoField.label}</p>
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
                <div className="grid gap-2" key={videoPosterField.key}>
                  <p className="admin-muted font-extrabold">{videoPosterField.label}</p>
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

          <div className="admin-image-manager__actions">
            <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveSettings()}>
              <Save size={16} /> {saving ? 'Guardando...' : saveLabel}
            </button>
            <button className="admin-btn admin-btn--ghost" type="button" onClick={() => void loadSettings()}>Descartar cambios</button>
          </div>

          <div>
            <button
              className="admin-btn admin-btn--ghost"
              type="button"
              onClick={() => setShowTable((current) => !current)}
              style={{ justifySelf: 'start' }}
            >
              {showTable ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showTable ? 'Ocultar tabla tecnica de claves' : `Ver tabla tecnica de claves (${fields.length})`}
            </button>
            {showTable ? (
              <div className="mt-3">
                <AdminTable headers={['Key', 'Tipo', 'Valor', 'Estado']}>
                  {fields.map((field) => {
                    const row = rowsByKey.get(field.key);
                    return (
                      <tr key={field.key}>
                        <td>{field.key}</td>
                        <td>{row?.type ?? field.type}</td>
                        <td className="admin-muted max-w-[24rem] truncate" title={draft[field.key]}>{field.type === 'image' ? (draft[field.key] || '(por defecto)') : draft[field.key]}</td>
                        <td><AdminBadge value={row?.active ?? true} /></td>
                      </tr>
                    );
                  })}
                </AdminTable>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

type ContentTab = 'hero' | 'about';

export default function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<ContentTab>('hero');

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Contenido general"
        description="Administra el hero del inicio y la pagina Nosotros sin cambiar codigo."
        actions={<span />}
      />

      <nav className="admin-tabs" aria-label="Secciones de contenido editable">
        <button type="button" className={`admin-tab${activeTab === 'hero' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('hero')}>
          Hero / inicio
        </button>
        <button type="button" className={`admin-tab${activeTab === 'about' ? ' admin-tab--active' : ''}`} onClick={() => setActiveTab('about')}>
          Nosotros / About
        </button>
      </nav>

      <div style={{ display: activeTab === 'hero' ? undefined : 'none' }}>
      <ContentSection
        title="Hero / inicio"
        description="La imagen administrada es el fondo principal del hero. El archivo de video queda conservado, pero no bloquea el contenido editable."
        fields={HERO_FIELDS}
        saveLabel="Guardar hero"
        imageRequireReplacement
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
        description="Controla la pagina /nosotros y la seccion Sobre nosotros de la inicio. La imagen administrada aparece primero en los carruseles; sin imagen se muestran las fotos por defecto."
        fields={ABOUT_FIELDS}
        saveLabel="Guardar Nosotros"
        preview={(draft) => (
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ocean-400">{draft['about.eyebrow.es']}</p>
              <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">{draft['about.title.es']}</h3>
              <p className="mt-3 text-sm leading-6 text-white/80">{draft['about.preview_text.es'].split('\n')[0]}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-xs font-extrabold">
                <ImageIcon size={13} /> {draft['about.preview_button_label.es']}
              </p>
            </div>
            {draft['about.image'] ? (
              <img className="aspect-[4/3] w-full rounded-xl object-cover" src={draft['about.image']} alt={draft['about.image_alt.es']} />
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
