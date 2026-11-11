import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminPageHeader } from '../../components/admin/AdminPrimitives';
import { BacCardCheckout } from '../../components/booking/BacCardCheckout';
import { getCurrentAdminProfile } from '../../services/adminAuthService';
import { BacPaymentError, type BacThreeDSecureResult } from '../../services/bacPaymentService';
import { certificationRequest, type CertificationPayment, type CertificationBrand } from '../../services/bacCertificationService';

const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };
const STATES = { prepared: 'Preparada', processing: 'Resultado pendiente · no repetir', paid: 'Aprobada', failed: 'No aprobada' };

export default function AdminBacCertificationPage() {
  const profile = useQuery({ queryKey: ['admin', 'currentProfile'], queryFn: getCurrentAdminProfile });
  const isAdmin = profile.data?.role === 'admin' && profile.data.active;
  const history = useQuery({ queryKey: ['admin', 'bac-certification'], queryFn: () => certificationRequest<{ enabled: boolean; payments: CertificationPayment[] }>({ operation: 'list' }), enabled: Boolean(isAdmin), retry: false });
  const [brand, setBrand] = useState<CertificationBrand>('visa');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [prepared, setPrepared] = useState<CertificationPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reconcile, setReconcile] = useState<CertificationPayment | null>(null);
  const [approved, setApproved] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const rows = history.data?.payments ?? [];

  async function prepare(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const row = await certificationRequest<CertificationPayment>({ operation: 'prepare', brand });
      await history.refetch();
      if (row.status !== 'prepared' || row.actor !== profile.data?.id) throw new Error('Esta marca ya tiene una prueba aprobada, pendiente o preparada por otro administrador. Revisa el historial.');
      setPrepared(row);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo preparar la prueba.'); }
    finally { setBusy(false); }
  }

  async function pay(id: string, paymentToken: string, threeDSecure: BacThreeDSecureResult) {
    const { cardHolderInfo: _info, ...authentication } = threeDSecure;
    try {
      const result = await certificationRequest<CertificationPayment>({ operation: 'pay', id, consent: true, paymentToken, threeDSecure: authentication, customer: { fullName: name.trim(), email: email.trim() } });
      if (result.id !== id || !['paid', 'failed'].includes(result.status)) throw new BacPaymentError('Respuesta incierta. Revisa el portal BAC antes de repetir.', 502);
      setPrepared(null); setBlocked(false);
      setNotice(result.status === 'paid' ? 'BAC aprobó USD 1.00. Verifica la marca en el portal y guarda la evidencia.' : 'BAC rechazó la prueba. No se registró una aprobación; revisa el historial antes de preparar otra.');
      // The reusable card renderer does not create or confirm any booking here.
      return { bookingId: result.id, bookingReference: result.reference, transactionId: result.transaction_id ?? '', amount: '1.00', currency: 'USD', paymentStatus: result.status, bookingStatus: 'certification' };
    } finally { void history.refetch(); }
  }

  async function saveReconciliation(event: React.FormEvent) {
    event.preventDefault(); if (!reconcile) return; setBusy(true); setError('');
    try {
      await certificationRequest({ operation: 'reconcile', id: reconcile.id, approved, ...(approved ? { transactionId: transactionId.trim() } : {}), note: note.trim() });
      setReconcile(null); setPrepared(null); setBlocked(false); setNotice('Resultado conciliado según la comprobación en el portal BAC.'); await history.refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo conciliar.'); }
    finally { setBusy(false); }
  }

  async function copyEvidence() {
    try {
      const evidence = rows.filter(row => row.status === 'paid').map(row => `${BRANDS[row.declared_brand]} (marca declarada; verificar en portal BAC)\nReferencia: ${row.reference}\nFecha UTC: ${row.updated_at}\nImporte: USD 1.00\nTransacción: ${row.transaction_id}\nAutorización: ${row.authorization_code || 'Consultar portal BAC'}\nEstado: aprobado`).join('\n\n');
      await navigator.clipboard.writeText(evidence); setCopied(true);
    } catch { setError('No se pudo copiar. Puedes seleccionar la evidencia del historial.'); }
  }

  if (profile.isLoading) return <p role="status">Validando acceso…</p>;
  if (!isAdmin) return <div className="admin-alert admin-alert--danger" role="alert">Solo los administradores activos pueden realizar pruebas BAC.</div>;
  return <div className="admin-page">
    <AdminPageHeader title="Pruebas BAC · USD 1" description="Certificación privada de Visa, Mastercard y American Express. No crea reservas ni modifica los paquetes." />
    <div className="admin-alert" role="note">Cada prueba envía un cargo real de <strong>USD 1.00 total</strong>. La marca seleccionada debe coincidir con la tarjeta; confírmala en el portal BAC. Anulaciones y devoluciones de estas pruebas se gestionan en ese portal.</div>
    {(error || history.error) && <div className="admin-alert admin-alert--danger" role="alert">{error || (history.error as Error).message}</div>}
    {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
    {history.isLoading ? <p role="status">Cargando configuración…</p> : !history.data?.enabled && !history.error ? <div className="admin-alert">Pruebas deshabilitadas en el servidor. La preparación en development no activa cargos.</div> : null}
    {!prepared && <form className="admin-card p-5 space-y-4" onSubmit={prepare}>
      <h2 className="text-lg font-semibold">Preparar una prueba</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="admin-field"><span className="admin-field__label">Marca de la tarjeta</span><select className="admin-select" value={brand} onChange={e => setBrand(e.target.value as CertificationBrand)} disabled={busy}>{Object.entries(BRANDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="admin-field"><span className="admin-field__label">Nombre del titular</span><input className="admin-input" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={120} required autoComplete="cc-name" disabled={busy} /></label>
        <label className="admin-field"><span className="admin-field__label">Correo del titular</span><input className="admin-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} disabled={busy} /></label>
      </div>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required disabled={busy} /><span>Confirmo que el titular autoriza una prueba real de USD 1.00 y que revisé que no existe ya una aprobación para esta marca.</span></label>
      <button className="admin-btn admin-btn--primary" disabled={!history.data?.enabled || !consent || busy}>Preparar formulario de USD 1.00</button>
    </form>}
    {prepared && <section className="rounded-2xl bg-ocean-950 p-4 text-white">
      <p className="text-sm">Prueba {BRANDS[prepared.declared_brand]} · {prepared.reference}</p>
      <BacCardCheckout key={prepared.id} createdBooking={{ booking_id: prepared.id, booking_reference: prepared.reference, total_snapshot: 1, currency: 'USD' }} customerName={name} customerEmail={email} customerPhone="" language="es" onSuccess={() => {}} onBlockedChange={setBlocked} submitPayment={pay} />
      {!blocked && <button className="mt-4 text-sm underline" onClick={() => setPrepared(null)}>Cerrar formulario sin cobrar</button>}
    </section>}
    <section className="admin-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Historial y evidencia</h2><div className="flex flex-wrap gap-2"><button className="admin-btn" onClick={() => void history.refetch()} disabled={history.isFetching}>Actualizar</button><button className="admin-btn" disabled={!rows.some(r => r.status === 'paid')} onClick={copyEvidence}>{copied ? 'Evidencia copiada' : 'Copiar aprobaciones'}</button></div></div>
      <p className="text-sm">Un resultado pendiente bloquea nuevos cobros de esa marca, incluso después de recargar la página. Espera al menos dos minutos y comprueba el portal antes de conciliar.</p>
      {!rows.length && !history.isLoading && <p>No hay pruebas registradas.</p>}
      <div className="divide-y divide-slate-200/30">{rows.map(row => <article key={row.id} className="py-4 space-y-1 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{BRANDS[row.declared_brand]} · USD 1.00</strong><span>{STATES[row.status]}</span></div>
        <p className="break-all">{row.reference}</p><p>{new Date(row.updated_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} · Costa Rica</p>
        {row.transaction_id && <p className="break-all">Transacción: {row.transaction_id} · Autorización: {row.authorization_code || 'Consultar portal'}</p>}
        {row.reconciled_by && <p>Conciliada manualmente: {row.reconciliation_note}</p>}
        {row.status === 'processing' && <button className="admin-btn mt-2" disabled={busy} onClick={() => { setReconcile(row); setApproved(false); setTransactionId(''); setNote(''); }}>Conciliar con el portal BAC</button>}
      </article>)}</div>
    </section>
    {reconcile && <form className="admin-card p-5 space-y-4" onSubmit={saveReconciliation}>
      <h2 className="text-lg font-semibold">Conciliar {BRANDS[reconcile.declared_brand]}</h2><p className="break-all text-sm">{reconcile.reference}. Esta acción registra el resultado que ya comprobaste en BAC; no envía otro cobro.</p>
      <label className="admin-field"><span className="admin-field__label">Resultado verificado</span><select className="admin-select" value={approved ? 'paid' : 'failed'} onChange={e => setApproved(e.target.value === 'paid')}><option value="failed">No hay cargo o BAC lo rechazó</option><option value="paid">BAC confirma el cargo aprobado</option></select></label>
      {approved && <label className="admin-field"><span className="admin-field__label">Transaction ID</span><input className="admin-input" value={transactionId} onChange={e => setTransactionId(e.target.value)} required pattern="[A-Za-z0-9-]{1,64}" /></label>}
      <label className="admin-field"><span className="admin-field__label">Comprobación realizada (sin datos de tarjeta)</span><textarea className="admin-input" value={note} onChange={e => setNote(e.target.value)} required minLength={10} maxLength={500} /></label>
      <div className="flex gap-2"><button className="admin-btn admin-btn--primary" disabled={busy}>Registrar resultado verificado</button><button type="button" className="admin-btn" onClick={() => setReconcile(null)} disabled={busy}>Cerrar</button></div>
    </form>}
  </div>;
}
