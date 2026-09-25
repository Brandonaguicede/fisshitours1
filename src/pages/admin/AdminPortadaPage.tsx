import { ContentSection, TranslateAllSiteContentCard, type ContentField } from '../../components/admin/AdminContentSection';
import { AdminPageHeader } from '../../components/admin/AdminPrimitives';

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
  { key: 'home.hero.media_mode', label: 'Modo de la portada', type: 'media_mode', fallback: 'image' },
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

// Portada is the Hero of the home page and nothing else: "Sobre Nosotros" has its own screen
// (AdminAboutPage, /admin/sobre-nosotros). Both share ContentSection so state, saving and the
// EN -> ES DeepL flow are the same code path.
export default function AdminPortadaPage() {
  return (
    <div className="admin-page admin-content-page">
      <AdminPageHeader
        title="Portada"
        description="Administra la portada del inicio (imagenes, video y textos) sin cambiar codigo."
        actions={<span />}
      />

      <ContentSection
        title="Portada"
        description="La imagen administrada es el fondo principal de la portada. El archivo de video queda conservado, pero no bloquea el contenido editable."
        fields={HERO_FIELDS}
        saveLabel="Guardar portada"
        savedMessage="Portada actualizada."
        imageRequireReplacement
        mediaTextTabs
        preview={(draft) => (
          <div className="relative overflow-hidden rounded-xl">
            {draft['home.hero.mobile_image'] ? (
              <img className="aspect-[4/5] w-full object-cover sm:hidden" src={draft['home.hero.mobile_image']} alt={draft['home.hero.image_alt.en']} />
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center border border-dashed border-white/25 text-xs text-white/60 sm:hidden">
                Sin imagen de celular
              </div>
            )}
            {draft['home.hero.image'] ? (
              <img className="hidden aspect-video w-full object-cover sm:block" src={draft['home.hero.image']} alt={draft['home.hero.image_alt.en']} />
            ) : (
              <div className="hidden aspect-video w-full place-items-center border border-dashed border-white/25 text-xs text-white/60 sm:grid">
                Sin imagen de compu
              </div>
            )}
            <div className="absolute inset-0 bg-ocean-950/55" />
            <div className="absolute inset-0 grid place-items-center p-5 text-center">
              <div>
                <p className="admin-content-preview__eyebrow">{draft['home.hero.eyebrow.en']}</p>
                <h3 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-5xl">{draft['home.hero.title.en']}</h3>
                <p className="admin-content-preview__lead">{draft['home.hero.subtitle.en']}</p>
              </div>
            </div>
          </div>
        )}
      />

      <TranslateAllSiteContentCard />
    </div>
  );
}
