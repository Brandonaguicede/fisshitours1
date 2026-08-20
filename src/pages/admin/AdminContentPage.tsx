import { Image as ImageIcon, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

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

const HERO_KEY = 'home.hero.image';
const FALLBACK_HERO_IMAGE = '/images/placeholder-image.jpg';

function storagePathFromPublicUrl(value?: string | null) {
  if (!value?.includes('/site-images/')) return null;
  return value.split('/site-images/')[1] ?? null;
}

export default function AdminContentPage() {
  const [settings, setSettings] = useState<SiteSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadSettings() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value, type, active')
      .in('key', [HERO_KEY])
      .order('key');

    setLoading(false);
    if (error) {
      setError(error.message);
      setSettings([]);
      return;
    }

    const rows = (data ?? []) as SiteSettingRow[];
    if (!rows.some((row) => row.key === HERO_KEY)) {
      rows.push({ key: HERO_KEY, value: FALLBACK_HERO_IMAGE, type: 'image', active: true });
    }
    setSettings(rows);
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveHeroImage(image: StorageImage) {
    const { error } = await supabase
      .from('site_settings')
      .upsert({
        key: HERO_KEY,
        value: image.public_url,
        type: 'image',
        active: true,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    setNotice('Imagen principal del inicio actualizada.');
    await loadSettings();
  }

  const hero = settings.find((setting) => setting.key === HERO_KEY);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Contenido general"
        description="Administra imagenes editables del sitio sin cambiar codigo."
        actions={<button className="admin-btn" type="button" onClick={() => void loadSettings()}><Save size={16} /> Recargar</button>}
      />

      {error ? <div className="admin-alert admin-alert--danger">{error}</div> : null}
      {notice ? <div className="admin-alert admin-alert--success">{notice}</div> : null}

      <section className="admin-card">
        <h2 className="admin-card__title"><ImageIcon size={18} /> Hero / inicio</h2>
        <p className="admin-muted mb-4">El video se conserva. Esta imagen funciona como poster y fallback del hero.</p>
        {loading ? (
          <p className="admin-muted">Cargando contenido...</p>
        ) : (
          <AdminImageManager
            resourceTable="site_settings"
            resourceId={HERO_KEY}
            folder="general"
            currentImageUrl={hero?.value ?? FALLBACK_HERO_IMAGE}
            currentStoragePath={storagePathFromPublicUrl(hero?.value)}
            label="Hero de inicio"
            aspect={16 / 9}
            maxWidth={1920}
            maxHeight={1080}
            maxSizeMB={0.9}
            requireReplacementToDelete
            onImageSaved={saveHeroImage}
          />
        )}
      </section>

      <AdminTable headers={['Key', 'Tipo', 'Valor', 'Estado']}>
        {settings.map((setting) => (
          <tr key={setting.key}>
            <td>{setting.key}</td>
            <td>{setting.type}</td>
            <td className="admin-muted">{setting.value}</td>
            <td><AdminBadge value={setting.active} /></td>
          </tr>
        ))}
        {!loading && settings.length === 0 ? (
          <tr><td colSpan={4} className="admin-muted">No hay configuraciones editables.</td></tr>
        ) : null}
      </AdminTable>
    </div>
  );
}
