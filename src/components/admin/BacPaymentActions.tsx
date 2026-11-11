import { Ban, CircleDollarSign, Loader2, Scale, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Modal } from '../common/Modal';
import { getCurrentAdminProfile } from '../../services/adminAuthService';
import { reconcileBacOperation, runBacAdminOperation, type BacAdminOperation } from '../../services/bookingService';
import { formatPaymentStatusLabel } from '../../utils/reservationsExport';

interface BacReservation {
  id: string;
  booking_reference: string;
  payment_method_key: string;
  payment_status: string;
  total_snapshot: number | string;
}

type Action = BacAdminOperation | 'reconcile';

// Keys are the gateway operation identifiers (quoted on purpose, see tests/terms-single-source.test.mjs).
const COPY: Record<Action, { label: string; title: string; description: string; confirm: string }> = {
  'capture': {
    label: 'Capturar',
    title: 'Capturar pago con tarjeta',
    description: 'Se cobrará al cliente el monto autorizado completo, la reserva quedará confirmada y se enviará el correo de confirmación.',
    confirm: 'Capturar',
  },
  'void': {
    label: 'Anular',
    title: 'Anular transacción con tarjeta',
    description: 'Se anulará la transacción en BAC (solo funciona antes de la liquidación del día), la reserva se cancelará y el horario quedará libre. Si BAC la rechaza porque ya se liquidó, usa Reembolsar.',
    confirm: 'Anular',
  },
  'refund': {
    label: 'Reembolsar',
    title: 'Reembolsar pago con tarjeta',
    description: 'Se devolverá el monto indicado a la tarjeta del cliente. Puede ser el total o una parte. La reserva no se cancela automáticamente.',
    confirm: 'Reembolsar',
  },
  'reconcile': {
    label: 'Conciliar',
    title: 'Conciliar operación con tarjeta',
    description: 'BAC no confirmó el resultado de la última operación. Búscala en el portal de BAC con la referencia de la reserva y registra aquí lo que muestra. No reintentes la operación antes de conciliar.',
    confirm: 'Registrar resultado',
  },
};

const ICONS = { 'capture': CircleDollarSign, 'void': Ban, 'refund': Undo2, 'reconcile': Scale } as const;
const TRANSACTION_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Which actions make sense for the booking's current payment status (the server re-validates everything). */
export function availableBacOperations(paymentStatus: string): Action[] {
  if (paymentStatus === 'processing') return ['reconcile'];
  if (paymentStatus === 'authorized') return ['capture', 'void'];
  if (paymentStatus === 'paid') return ['void', 'refund'];
  return [];
}

/**
 * Capture / Void / Refund / Reconcile for a BAC card booking. Rendered only for active admins: moving money is not
 * an editor permission (admin-bac-transaction enforces the same rule server side).
 */
export function BacPaymentActions({ reservation, disabled, onCompleted, onError }: {
  reservation: BacReservation;
  disabled?: boolean;
  /** Receives a ready-to-show summary of what happened. */
  onCompleted: (notice: string) => void;
  onError: (message: string) => void;
}) {
  const titleId = useId();
  const [action, setAction] = useState<Action | null>(null);
  const [amount, setAmount] = useState('');
  const [approved, setApproved] = useState<boolean | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [busy, setBusy] = useState(false);
  // A 409 / 502 from an operation means a previous gateway call is still unsettled: offer Conciliar right away.
  const [needsReconcile, setNeedsReconcile] = useState(false);
  const profileQuery = useQuery({ queryKey: ['admin', 'currentProfile'], queryFn: getCurrentAdminProfile, staleTime: 5 * 60 * 1000 });

  if (reservation.payment_method_key !== 'bac-card' || profileQuery.data?.role !== 'admin') return null;
  const actions = needsReconcile ? ['reconcile' as const] : availableBacOperations(reservation.payment_status);
  if (!actions.length) return null;

  const refundAmount = Number(amount);
  const refundInvalid = action === 'refund' && !(Number.isFinite(refundAmount) && refundAmount > 0 && /^\d+(\.\d{1,2})?$/.test(amount.trim()));
  const reconcileInvalid = action === 'reconcile' && (approved === null || (approved && !TRANSACTION_ID.test(transactionId.trim())));
  const invalid = refundInvalid || reconcileInvalid;
  const reference = reservation.booking_reference;

  function open(next: Action) {
    setAction(next);
    setAmount(next === 'refund' ? Number(reservation.total_snapshot).toFixed(2) : '');
    setApproved(null);
    setTransactionId('');
  }

  async function execute(current: Action): Promise<string> {
    if (current === 'reconcile') {
      const result = await reconcileBacOperation(reservation.id, approved === true, approved ? transactionId.trim() : undefined);
      return result.approved
        ? `Operación conciliada como aprobada en BAC para ${reference}. Estado del pago: ${formatPaymentStatusLabel(result.payment_status)}.`
        : `Operación conciliada como no procesada para ${reference}. Ya puedes repetirla si corresponde.`;
    }
    const result = await runBacAdminOperation(reservation.id, current, current === 'refund' ? Math.round(refundAmount * 100) / 100 : undefined);
    const charged = `$${Number(result.amount).toFixed(2)}`;
    if (current === 'capture') return `Pago capturado (${charged}). La reserva ${reference} quedó confirmada y el correo de confirmación fue encolado.`;
    if (current === 'void') return `Transacción anulada en BAC. La reserva ${reference} fue cancelada y el horario quedó libre.`;
    return `Se reembolsaron ${charged} de la reserva ${reference}.${result.payment_status === 'refunded' ? ' El pago quedó reembolsado por completo.' : ''}`;
  }

  async function submit() {
    if (!action || busy || invalid) return;
    setBusy(true);
    try {
      const notice = await execute(action);
      setAction(null);
      setNeedsReconcile(false);
      onCompleted(notice);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (action !== 'reconcile' && (status === 409 || status === 502)) setNeedsReconcile(true);
      setAction(null);
      onError(error instanceof Error ? error.message : 'La operación con tarjeta no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  const copy = action ? COPY[action] : null;

  return (
    <>
      {actions.map((item) => {
        const Icon = ICONS[item];
        return (
          <button
            key={item}
            className={item === 'capture' ? 'admin-action-btn admin-action-btn--confirm' : 'admin-action-btn'}
            type="button"
            title={COPY[item].title}
            aria-label={`${COPY[item].label} pago de ${reference}`}
            disabled={disabled || busy}
            onClick={() => open(item)}
          >
            <Icon size={14} /> {COPY[item].label}
          </button>
        );
      })}

      <Modal open={Boolean(action)} onClose={() => { if (!busy) setAction(null); }} titleId={titleId} className="max-w-md">
        {copy ? (
          <div className="admin-modal-card">
            <h2 id={titleId} className="admin-card__title">{copy.title}</h2>
            <p className="admin-muted mt-2">Reserva <strong>{reference}</strong>.</p>
            <p className="admin-muted mt-2">{copy.description}</p>

            {action === 'refund' ? (
              <label className="admin-field mt-4">
                <span className="admin-field__label">Monto a reembolsar (USD)</span>
                <input className="admin-input" inputMode="decimal" value={amount} aria-invalid={refundInvalid || undefined} onChange={(event) => setAmount(event.target.value)} />
                <span className="admin-muted text-xs">Máximo: lo pagado menos lo ya reembolsado. El servidor valida el límite.</span>
              </label>
            ) : null}

            {action === 'reconcile' ? (
              <fieldset className="admin-field mt-4">
                <legend className="admin-field__label">¿Qué muestra el portal de BAC?</legend>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" name={`${titleId}-outcome`} checked={approved === true} onChange={() => setApproved(true)} /> La operación aparece aprobada
                </label>
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="radio" name={`${titleId}-outcome`} checked={approved === false} onChange={() => setApproved(false)} /> La operación no aparece o fue rechazada
                </label>
                {approved ? (
                  <label className="admin-field mt-3">
                    <span className="admin-field__label">Transaction ID de BAC</span>
                    <input className="admin-input" value={transactionId} aria-invalid={reconcileInvalid || undefined} onChange={(event) => setTransactionId(event.target.value)} />
                  </label>
                ) : null}
              </fieldset>
            ) : null}

            <div className="admin-actions mt-5">
              <button className={action === 'capture' || action === 'reconcile' ? 'admin-btn' : 'admin-btn admin-btn--danger'} type="button" disabled={busy || invalid} onClick={() => void submit()}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : null} {copy.confirm}
              </button>
              <button className="admin-btn admin-btn--secondary" type="button" disabled={busy} onClick={() => setAction(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export default BacPaymentActions;
