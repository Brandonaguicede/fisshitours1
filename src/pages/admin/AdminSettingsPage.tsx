import { AdminPageHeader } from '../../components/admin/AdminPrimitives';

export default function AdminSettingsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Settings" description="Configuracion de Supabase, Cloudflare Images, PayPal y roles admin." />
      <section className="admin-card">
        <h2>Integraciones pendientes</h2>
        <p>Estas variables deben quedar en `.env.example` y las privadas solo en Edge Functions.</p>
        <ul className="admin-list mt-4">
          <li><span>Supabase Auth + RLS</span><span className="admin-badge admin-badge--warning">pendiente</span></li>
          <li><span>PayPal Edge Functions</span><span className="admin-badge admin-badge--warning">pendiente</span></li>
          <li><span>Cloudflare Images Edge Functions</span><span className="admin-badge admin-badge--warning">pendiente</span></li>
          <li><span>Roles admin/editor/viewer</span><span className="admin-badge admin-badge--warning">pendiente</span></li>
        </ul>
      </section>
      <section className="admin-card">
        <h2>Variables esperadas</h2>
        <p>VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN.</p>
      </section>
    </div>
  );
}
