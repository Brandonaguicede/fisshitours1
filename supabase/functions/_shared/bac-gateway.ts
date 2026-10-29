// BAC Credomatic card gateway (NMI platform), server side only.
//
// Flow (see docs/bac-payment-integration.md):
//   1. Browser: Collect.js tokenizes the card -> single-use payment_token.
//   2. Browser: Gateway.js runs 3-D Secure on that token -> cavv/eci/... values.
//   3. Server (this module): Payment API "sale" with the PRIVATE security key.
//
// Nothing in this file may log or persist the payment token, the security key
// or any card data. Only the whitelisted response fields below are stored.

export interface BacThreeDSecure {
  cavv: string;
  xid?: string;
  eci: string;
  cardHolderAuth: 'verified' | 'attempted';
  threeDsVersion: string;
  directoryServerId?: string;
}

/** The BAC merchant account (and its processor id) is contracted for US dollars only. */
export const BAC_CURRENCY = 'USD';

/** Customer checkout: charge now (`sale`) or only hold the funds for a later admin capture (`auth`). */
export type BacCheckoutType = 'sale' | 'auth';
/** Admin follow-up operations on an existing gateway transaction. */
export type BacFollowUpType = 'capture' | 'void' | 'refund';

export interface BacSaleInput {
  type: BacCheckoutType;
  securityKey: string;
  paymentToken: string;
  amount: string;
  taxAmount: string;
  currency: string;
  /** BAC_PROCESSOR_ID: routes the charge to the contracted processor (MID). */
  processorId?: string;
  orderId: string;
  orderDescription: string;
  attemptId: string;
  customer: { fullName: string; email: string };
  ipAddress?: string;
  threeDSecure: BacThreeDSecure;
}

export interface BacFollowUpInput {
  type: BacFollowUpType;
  securityKey: string;
  /** Gateway transaction id of the original auth / sale / capture. */
  transactionId: string;
  /** Required for capture and refund (x.xx). Void always cancels the whole transaction. */
  amount?: string;
  orderId: string;
}

export interface BacSaleResult {
  approved: boolean;
  transactionId: string;
  responseCode: string;
  responseText: string;
  /** Safe-to-store subset of the gateway answer (no token, no key, no card data). */
  audit: Record<string, string>;
}

const AUDIT_FIELDS = ['response', 'responsetext', 'response_code', 'authcode', 'transactionid', 'avsresponse', 'cvvresponse', 'orderid', 'type'];

const BASE64ISH = /^[A-Za-z0-9+/=_-]{1,128}$/;
const UUIDISH = /^[A-Za-z0-9-]{1,64}$/;

/** Rejects payloads that did not complete 3-D Secure; BAC requires it for every sale. */
export function validateThreeDSecure(value: unknown): BacThreeDSecure | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '');
  const cavv = text('cavv');
  const xid = text('xid');
  const eci = text('eci');
  const cardHolderAuth = text('cardHolderAuth');
  const threeDsVersion = text('threeDsVersion');
  const directoryServerId = text('directoryServerId');

  if (!BASE64ISH.test(cavv)) return null;
  if (!/^\d{1,2}$/.test(eci)) return null;
  if (cardHolderAuth !== 'verified' && cardHolderAuth !== 'attempted') return null;
  if (!/^2\.\d{1,2}\.\d{1,2}$/.test(threeDsVersion)) return null;
  if (xid && !BASE64ISH.test(xid)) return null;
  if (directoryServerId && !UUIDISH.test(directoryServerId)) return null;

  return {
    cavv,
    eci,
    cardHolderAuth,
    threeDsVersion,
    ...(xid ? { xid } : {}),
    ...(directoryServerId ? { directoryServerId } : {}),
  };
}

export function splitCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: parts[0] ?? '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}

/** Reads BAC_TRANSACTION_TYPE: `auth` holds funds for a later capture; anything else charges immediately. */
export function getBacCheckoutType(): BacCheckoutType {
  return Deno.env.get('BAC_TRANSACTION_TYPE')?.trim().toLowerCase() === 'auth' ? 'auth' : 'sale';
}

/** Builds the urlencoded body for the Payment API sale / auth. Amounts always come from the booking row. */
export function buildSaleRequest(input: BacSaleInput): URLSearchParams {
  if (input.type !== 'sale' && input.type !== 'auth') throw new Error('Invalid checkout transaction type');
  if (input.currency !== BAC_CURRENCY) throw new Error(`BAC card payments only accept ${BAC_CURRENCY}`);
  const { firstName, lastName } = splitCustomerName(input.customer.fullName);
  const body = new URLSearchParams({
    security_key: input.securityKey,
    type: input.type,
    payment_token: input.paymentToken,
    amount: input.amount,
    tax: input.taxAmount,
    currency: input.currency,
    orderid: input.orderId,
    order_description: input.orderDescription.slice(0, 255),
    first_name: firstName.slice(0, 60),
    last_name: lastName.slice(0, 60),
    email: input.customer.email,
    merchant_defined_field_1: input.attemptId,
    cavv: input.threeDSecure.cavv,
    eci: input.threeDSecure.eci,
    cardholder_auth: input.threeDSecure.cardHolderAuth,
    three_ds_version: input.threeDSecure.threeDsVersion,
  });
  if (input.processorId) body.set('processor_id', input.processorId);
  if (input.threeDSecure.xid) body.set('xid', input.threeDSecure.xid);
  if (input.threeDSecure.directoryServerId) body.set('directory_server_id', input.threeDSecure.directoryServerId);
  if (input.ipAddress) body.set('ipaddress', input.ipAddress);
  return body;
}

/**
 * Capture / void / refund of an existing transaction. Amounts are decided server side from the payments ledger.
 * No processor_id: the Payment API only accepts it on sale/auth; follow-ups stay on the original transaction's processor.
 */
export function buildFollowUpRequest(input: BacFollowUpInput): URLSearchParams {
  if (!['capture', 'void', 'refund'].includes(input.type)) throw new Error('Invalid follow-up transaction type');
  if (!/^[A-Za-z0-9-]{1,64}$/.test(input.transactionId)) throw new Error('Invalid gateway transaction id');
  const body = new URLSearchParams({ security_key: input.securityKey, type: input.type, transactionid: input.transactionId });
  if (input.type !== 'void') {
    if (!input.amount || !/^\d+\.\d{2}$/.test(input.amount) || Number(input.amount) <= 0) throw new Error('A positive x.xx amount is required');
    body.set('amount', input.amount);
  }
  if (input.type === 'capture') body.set('orderid', input.orderId);
  return body;
}

/** Payment API answers `response=1&responsetext=...&response_code=100...`. Approved only on 1 + 100 (fail closed otherwise). */
export function parseGatewayResponse(raw: string, expectedOrderId: string): BacSaleResult {
  const params = new URLSearchParams(raw.trim());
  const audit: Record<string, string> = {};
  for (const field of AUDIT_FIELDS) {
    const value = params.get(field);
    if (value !== null) audit[field] = value.slice(0, 255);
  }
  const responseCode = params.get('response_code') ?? '';
  const orderMatches = !params.has('orderid') || params.get('orderid') === expectedOrderId;
  return {
    approved: params.get('response') === '1' && responseCode === '100' && orderMatches && Boolean(params.get('transactionid')),
    transactionId: params.get('transactionid') ?? '',
    responseCode,
    responseText: params.get('responsetext') ?? '',
    audit,
  };
}

/**
 * POSTs one Payment API request. Throws on timeout, network error or non-2xx: callers must treat that as
 * "outcome unknown" (never as a decline) and leave the ledger row "processing" for reconciliation.
 */
export async function postGatewayRequest(url: string, body: URLSearchParams, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function getBacGatewayApiUrl(): string {
  const base = (Deno.env.get('BAC_GATEWAY_URL') ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) throw new Error('BAC gateway is not configured');
  return `${base}/api/transact.php`;
}

export function getBacSecurityKey(): string {
  const key = Deno.env.get('BAC_SECURITY_KEY');
  if (!key) throw new Error('BAC gateway is not configured');
  return key;
}

/** Optional BAC_PROCESSOR_ID. A malformed value is a configuration error, never silently dropped. */
export function getBacProcessorId(): string | undefined {
  const processorId = Deno.env.get('BAC_PROCESSOR_ID')?.trim();
  if (!processorId) return undefined;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(processorId)) throw new Error('BAC processor id is invalid');
  return processorId;
}

/** Returns the caller IP only when it is a well-formed IPv4/IPv6 literal. */
export function getClientIpAddress(req: Request): string | undefined {
  const candidate = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return candidate;
  if (/^[0-9a-f:]{2,45}$/i.test(candidate) && candidate.includes(':')) return candidate;
  return undefined;
}
