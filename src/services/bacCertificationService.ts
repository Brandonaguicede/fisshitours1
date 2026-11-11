import { functionsUrl, supabase } from '../lib/supabase';
import { BacPaymentError } from './bacPaymentService';

export type CertificationBrand = 'visa' | 'mastercard' | 'amex';
export interface CertificationPayment {
  id: string;
  reference: string;
  declared_brand: CertificationBrand;
  amount: number;
  currency: 'USD';
  status: 'prepared' | 'processing' | 'paid' | 'failed';
  actor: string;
  transaction_id: string | null;
  authorization_code: string | null;
  response_code: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  reconciled_by: string | null;
  reconciliation_note: string | null;
}

export async function certificationRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new BacPaymentError('Inicia sesión como administrador.', 401);
  const response = await fetch(`${functionsUrl}/admin-bac-certification`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new BacPaymentError(result?.message || 'No se pudo confirmar el resultado. Actualiza el historial antes de repetir.', response.status >= 400 ? response.status : 502);
  return result as T;
}
