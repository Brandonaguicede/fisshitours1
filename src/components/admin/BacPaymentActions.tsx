import { Ban, CircleDollarSign, Loader2, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Modal } from '../common/Modal';
import { getCurrentAdminProfile } from '../../services/adminAuthService';
import { runBacAdminOperation, type BacAdminOperation, type BacAdminOperationResult } from '../../services/bookingService';

interface BacReservation {
  id: string;
  booking_reference: string;
  payment_method_key: string;
  payment_status: string;
  total_snapshot: number | string;
}

const COPY: Record<BacAdminOperation, { label: string; title: string; description: string; confirm: string }> = {
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
};

/** Which gateway operations make sense for the booking's current payment status (the server re-validates everything). */
export function availableBacOperations(paymentStatus: string): BacAdminOperation[] {
  if (paymentStatus === 'authorized') return ['capture', 'void'];
  if (paymentStatus === 'paid') return ['void', 'refund'];
  return [];
}

/**
 * Capture / Void / Refund for a BAC card booking. Rendered only for active admins: moving money is not an
 * editor permission (admin-bac-transaction enforces the same rule server side).
 */
export function BacPaymentActions({ reservation, disabled, onCompleted, onError }: {
  reservation: BacReservation;
  disabled?: boolean;
  onCompleted: (result: BacAdminOperationResult) => void;
  onError: (message: string) => void;
}) {
  const titleId = useId();
  const [operation, setOperation] = useState<BacAdminOperation | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const profileQuery = useQuery({ queryKey: ['admin', 'currentProfile'], queryFn: getCurrentAdminProfile, staleTime: 5 * 60 * 1000 });

  if (reservation.payment_method_key !== 'bac-card' || profileQuery.data?.role !== 'admin') return null;
  const operations = availableBacOperations(reservation.payment_status);
  if (!operations.length) return null;

  const refundAmount = Number(amount);
  const refundInvalid = operation === 'refund' && !(Number.isFinite(refundAmount) && refundAmount > 0 && /^\d+(\.\d{1,2})?$/.test(amount.trim()));

  function open(next: BacAdminOperation) {
    setOperation(next);
    setAmount(next === 'refund' ? Number(reservation.total_snapshot).toFixed(2) : '');
  }

  async function submit() {
    if (!operation || busy || refundInvalid) return;
    setBusy(true);
    try {
      const result = await runBacAdminOperation(reservation.id, operation, operation === 'refund' ? Math.round(refundAmount * 100) / 100 : undefined);
      setOperation(null);
      onCompleted(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'La operación con tarjeta no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  // Keys are the gateway operation identifiers (quoted on purpose, see tests/terms-single-source.test.mjs).
  const icons = { 'capture': CircleDollarSign, 'void': Ban, 'refund': Undo2 } as const;
  const copy = operation ? COPY[operation] : null;

  return (
    <>
      {operations.map((item) => {
        const Icon = icons[item];
        return (
          <button
            key={item}
            className={item === 'capture' ? 'admin-action-btn admin-action-btn--confirm' : 'admin-action-btn'}
            type="button"
            title={COPY[item].title}
            aria-label={`${COPY[item].label} pago de ${reservation.booking_reference}`}
            disabled={disabled || busy}
            onClick={() => open(item)}
          >
            <Icon size={14} /> {COPY[item].label}
          </button>
        );
      })}

      <Modal open={Boolean(operation)} onClose={() => { if (!busy) setOperation(null); }} titleId={titleId} className="max-w-md">
        {copy ? (
          <div className="admin-modal-card">
            <h2 id={titleId} className="admin-card__title">{copy.title}</h2>
            <p className="admin-muted mt-2">Reserva <strong>{reservation.booking_reference}</strong>.</p>
            <p className="admin-muted mt-2">{copy.description}</p>
            {operation === 'refund' ? (
              <label className="admin-field mt-4">
                <span className="admin-field__label">Monto a reembolsar (USD)</span>
                <input
                  className="admin-input"
                  inputMode="decimal"
                  value={amount}
                  aria-invalid={refundInvalid || undefined}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span className="admin-muted text-xs">Máximo: lo pagado menos lo ya reembolsado. El servidor valida el límite.</span>
              </label>
            ) : null}
            <div className="admin-actions mt-5">
              <button className={operation === 'capture' ? 'admin-btn' : 'admin-btn admin-btn--danger'} type="button" disabled={busy || refundInvalid} onClick={() => void submit()}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : null} {copy.confirm}
              </button>
              <button className="admin-btn admin-btn--secondary" type="button" disabled={busy} onClick={() => setOperation(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export default BacPaymentActions;
