import { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPrimitives';
import { getPayPalClientId, getPayPalErrorMessage, loadPayPalSdk } from '../../services/paypalService';

export default function AdminSettingsPage() {
  const clientId = getPayPalClientId();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');

  async function testPayPal() {
    setTesting(true);
    setResult('Cargando el SDK de PayPal…');
    try {
      await loadPayPalSdk(clientId);
      setResult('SDK de PayPal cargado y botones disponibles. Falta verificar la creación y captura de una orden con una cuenta Sandbox. Esta prueba no realiza cobros.');
    } catch (error) {
      setResult(`La prueba falló: ${getPayPalErrorMessage(error)}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader title="Settings" description="Configuracion de Supabase, Cloudflare Images, PayPal y roles admin." />
      <section className="admin-card">
        <h2>Comprobar PayPal</h2>
        <p>{clientId ? 'Client ID presente en este despliegue.' : 'Falta el Client ID en este despliegue. En Vercel, configura VITE_PAYPAL_CLIENT_ID para Production y ejecuta Redeploy.'}</p>
        <p>La prueba solo carga el SDK. No crea reservas ni realiza cobros, y no verifica las credenciales privadas de Supabase.</p>
        <button type="button" className="admin-btn mt-4" disabled={!clientId || testing} onClick={testPayPal}>
          {testing ? 'Comprobando PayPal…' : 'Probar carga de PayPal'}
        </button>
        <p role="status" aria-live="polite" className="mt-4">{result}</p>
      </section>
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
        <p>Variables publicas de Vite para el navegador y secretos privados configurados solo en Edge Functions.</p>
      </section>
    </div>
  );
}
