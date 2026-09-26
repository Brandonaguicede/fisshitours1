import { ContentSection, type ContentField } from '../../components/admin/AdminContentSection';
import { AdminPageHeader } from '../../components/admin/AdminPrimitives';
import { ABOUT_CAROUSEL_DEFAULTS, buildAboutCarouselImages, DEFAULT_ABOUT_SETTINGS } from '../../services/aboutSettings';

// This is the exact field list the About tab had before it moved here (nothing added, nothing dropped).
// Etiqueta (eyebrow) and both button labels were already NOT editable before the move — see the CIERRE
// DE SEGURIDAD pass: they're structural CTA copy and stay controlled by code.
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
    ['about.preview_text', 'Texto de inicio', 'textarea'],
    ['about.story', 'Historia', 'textarea'],
    ['about.image_alt', 'Texto alternativo imagen', 'text'],
  ] as const).flatMap(([base, label, type]): ContentField[] => (['es', 'en'] as const).map((lang) => {
    const key = `${base}.${lang}` as keyof typeof DEFAULT_ABOUT_SETTINGS;
    return { key, label: `${label} ${lang.toUpperCase()}`, type, fallback: DEFAULT_ABOUT_SETTINGS[key] };
  }))),
  { key: 'about.image', label: 'Carrusel About - foto 5 (opcional)', type: 'image', fallback: '', aspect: 16 / 9, maxWidth: 1920, maxHeight: 1080 },
];

// Sobre Nosotros used to be a tab inside the Hero screen; it now has its own route
// (/admin/sobre-nosotros) with the exact same fields, storage keys and save flow.
export default function AdminAboutPage() {
  return (
    <div className="admin-page admin-content-page">
      <AdminPageHeader
        title="Sobre Nosotros"
        description="Fotos del carrusel, textos e historia de la sección Sobre Nosotros."
        actions={<span />}
      />

      <ContentSection
        title="Sobre Nosotros"
        description="Cambia cada foto del carrusel de Sobre nosotros. Se muestran en orden del 1 al 5 y cambian automáticamente. La quinta foto es opcional."
        fields={ABOUT_FIELDS}
        savedMessage="Sobre Nosotros actualizado."
        preview={(draft) => {
          const images = buildAboutCarouselImages(draft);
          return (
            <div className="admin-about-preview">
              <div className="admin-about-preview__copy">
                <h3 className="admin-about-preview__title">{draft['about.title.en']}</h3>
                <p className="admin-content-preview__text">{draft['about.preview_text.en'].split('\n')[0]}</p>
              </div>
              {images.length ? (
                <div className="admin-about-preview__thumbs">
                  {images.map((src, index) => <img key={src} src={src} alt={`Foto ${index + 1}`} loading="lazy" />)}
                </div>
              ) : (
                <div className="admin-about-preview__empty">Sin imagen gestionada (usa fotos por defecto)</div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
