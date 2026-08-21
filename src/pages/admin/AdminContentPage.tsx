import { Eye, Image as ImageIcon, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AdminImageManager from '../../components/admin/AdminImageManager';
import { AdminBadge, AdminPageHeader, AdminTable } from '../../components/admin/AdminPrimitives';
import { supabase } from '../../lib/supabase';
import type { StorageImage } from '../../services/imageService';

interface SiteSettingRow {
  key: string;
  value: string;
  type: string;
  active: boolean;
}

const FALLBACK_HERO_IMAGE = '/images/placeholder-image.jpg';

const HERO_SETTINGS = [
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
  { key: 'home.hero.image', label: 'Imagen principal', type: 'image', fallback: FALLBACK_HERO_IMAGE },
  { key: 'home.hero.primary_enabled', label: 'Activar boton principal', type: 'boolean', fallback: 'true' },
  { key: 'home.hero.secondary_enabled', label: 'Activar boton secundario', type: 'boolean', fallback: 'true' },
] as const;

type HeroKey = (typeof HERO_SETTINGS)[number]['key'];

function storagePathFromPublicUrl(value?: string | null) {
  if (!value?.includes('/site-images/')) return null;
  return value.split('/site-images/')[1] ?? null;
}

function defaultsMap() {
  return HERO_SETTINGS.reduce<Record<HeroKey, string>>((acc, item) => {
    acc[item.key] = item.fallback;
    return acc;
  }, {} as Record<HeroKey, string>);
}

export default function AdminContentPage() {
  const [settings, setSettings] = useState<SiteSettingRow[]>([]);
  const [draft, setDraft] = useState<Record<HeroKey, string>>(defaultsMap());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const rowsByKey = useMemo(() => new Map(settings.map((setting) => [setting.key, setting])), [settings]);

  async function loadSettings() {
    setLoading(true);
    setError('');
    const keys = HERO_SETTINGS.map((setting) => setting.key);
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value, type, active')
      .in('key', keys)
      .order('key');

    setLoading(false);
    if (error) {
      setError(error.message);
      setSettings([]);
      setDraft(defaultsMap());
      return;
    }

    const rows = (data ?? []) as SiteSettingRow[];
    const nextDraft = defaultsMap();
    rows.forEach((row) => {
      if (row.key in nextDraft && row.value) nextDraft[row.key as HeroKey] = row.value;
    });
    setSettings(rows);
    setDraft(nextDraft);
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError('');
    setNotice('');
    const payload = HERO_SETTINGS.map((item) => ({
      key: item.key,
      value: draft[item.key].trim() || item.fallback,
      type: item.type,
      active: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('site_settings').upsert(payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice('Hero actualizado. La pagina publica usara estos valores sin redesplegar.');
    await loadSettings();
  }

  async function saveHeroImage(image: StorageImage) {
    const next = { ...draft, 'home.hero.image': image.public_url };
    setDraft(next);
    const { error } = await supabase
      .from('site_settings')
      .upsert({
        key: 'home.hero.image',
        value: image.public_url,
        type: 'image',
        active: true,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    setNotice('Imagen principal del inicio actualizada.');
    await loadSettings();
  }

  function updateDraft(key: HeroKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Contenido general"
        description="Administra el hero y las imagenes editables del sitio sin cambiar codigo."
        actions={<button className="admin-btn" type="button" onClick={() => void loadSettings()}><Save size={16} /> Recargar</button>}
      />

      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      <section className="admin-card">
        <h2 className="admin-card__title"><ImageIcon size={18} /> Hero / inicio</h2>
        <p className="admin-muted mb-4">La imagen administrada es el fondo principal del hero. El archivo de video queda conservado, pero no bloquea el contenido editable.</p>
        {loading ? (
          <p className="admin-muted">Cargando contenido...</p>
        ) : (
          <div className="grid gap-5">
            <AdminImageManager
              resourceTable="site_settings"
              resourceId="home.hero.image"
              folder="general"
              currentImageUrl={draft['home.hero.image']}
              currentStoragePath={storagePathFromPublicUrl(draft['home.hero.image'])}
              label={draft['home.hero.image_alt.es']}
              aspect={16 / 9}
              maxWidth={1920}
              maxHeight={1080}
              maxSizeMB={0.9}
              requireReplacementToDelete
              onImageSaved={saveHeroImage}
            />

            <div className="grid gap-3 lg:grid-cols-2">
              {HERO_SETTINGS.filter((item) => item.type !== 'image' && item.type !== 'boolean').map((item) => (
                <label className="grid gap-1" key={item.key}>
                  <span className="admin-muted">{item.label}</span>
                  {item.type === 'textarea' ? (
                    <textarea className="admin-input min-h-24" value={draft[item.key]} onChange={(event) => updateDraft(item.key, event.target.value)} />
                  ) : (
                    <input className="admin-input" value={draft[item.key]} onChange={(event) => updateDraft(item.key, event.target.value)} />
                  )}
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft['home.hero.primary_enabled'] !== 'false'} onChange={(event) => updateDraft('home.hero.primary_enabled', String(event.target.checked))} />
                <span className="admin-muted">Activar boton principal</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft['home.hero.secondary_enabled'] !== 'false'} onChange={(event) => updateDraft('home.hero.secondary_enabled', String(event.target.checked))} />
                <span className="admin-muted">Activar boton secundario</span>
              </label>
            </div>

            <div className="rounded-2xl border border-white/70 bg-ocean-950 p-4 text-white shadow-soft">
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ocean-300"><Eye size={14} /> Vista previa</p>
              <div className="relative overflow-hidden rounded-xl">
                <img className="aspect-video w-full object-cover" src={draft['home.hero.image']} alt={draft['home.hero.image_alt.es']} />
                <div className="absolute inset-0 bg-ocean-950/45" />
                <div className="absolute inset-0 grid place-items-center p-5 text-center">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/75">{draft['home.hero.eyebrow.es']}</p>
                    <h3 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-5xl">{draft['home.hero.title.es']}</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-white/80 sm:text-base">{draft['home.hero.subtitle.es']}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-image-manager__actions">
              <button className="admin-btn" type="button" disabled={saving} onClick={() => void saveSettings()}>{saving ? 'Guardando...' : 'Guardar hero'}</button>
            </div>
          </div>
        )}
      </section>

      <AdminTable headers={['Key', 'Tipo', 'Valor', 'Estado']}>
        {HERO_SETTINGS.map((setting) => {
          const row = rowsByKey.get(setting.key);
          return (
            <tr key={setting.key}>
              <td>{setting.key}</td>
              <td>{row?.type ?? setting.type}</td>
              <td className="admin-muted">{draft[setting.key]}</td>
              <td><AdminBadge value={row?.active ?? true} /></td>
            </tr>
          );
        })}
      </AdminTable>
    </div>
  );
}
