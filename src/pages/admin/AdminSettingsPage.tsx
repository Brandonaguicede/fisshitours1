import { AdminPageHeader } from '../../components/admin/AdminPrimitives';

export default function AdminSettingsPage() {
  return (
    <div className="admin-page">
      <AdminPageHeader title="Settings" description="Integraciones utilizadas por el panel administrativo." />
      <section className="admin-card">
        <h2>Integraciones del proyecto</h2>
        <p>Esta lista describe las integraciones implementadas. No realiza comprobaciones de disponibilidad en tiempo real.</p>
        <ul className="admin-list mt-4">
          <li><span>Supabase Auth + RLS</span><span>Inicio de sesión y acceso a datos según permisos.</span></li>
          <li><span>PayPal Edge Functions</span><span>Creación, captura y cancelación de pagos; webhook.</span></li>
          <li><span>Cloudflare R2 Media Storage</span><span>Almacenamiento de imágenes y videos mediante Edge Functions.</span></li>
          <li><span>Roles admin/editor/viewer</span><span>Permisos administrativos definidos en los perfiles y RLS.</span></li>
          <li><span>Resend</span><span>Envío de correos de reservas y confirmaciones.</span></li>
        </ul>
      </section>
      <section className="admin-card">
        <h2>Variables esperadas</h2>
        <p>Nombres de variables públicas utilizadas por el frontend. Sus valores no se muestran aquí.</p>
        <ul className="admin-list mt-4">
          <li><code>VITE_SUPABASE_URL</code><span>URL pública de Supabase.</span></li>
          <li><code>VITE_SUPABASE_ANON_KEY</code><span>Clave pública de acceso a Supabase.</span></li>
          <li><code>VITE_PAYPAL_CLIENT_ID</code><span>Identificador público para el checkout de PayPal.</span></li>
          <li><code>VITE_TURNSTILE_SITE_KEY</code><span>Clave pública para la verificación de formularios.</span></li>
          <li><code>VITE_DISABLE_TURNSTILE</code><span>Control de verificación de formularios en el frontend.</span></li>
          <li><code>VITE_WHATSAPP_NUMBER</code><span>Número de contacto utilizado en los enlaces de WhatsApp.</span></li>
        </ul>
        <p className="mt-4">Los secretos privados de almacenamiento, PayPal y correo se administran en Supabase Edge Functions Secrets.</p>
      </section>
    </div>
  );
}
