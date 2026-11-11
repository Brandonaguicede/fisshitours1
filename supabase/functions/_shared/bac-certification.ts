import { z } from 'npm:zod@3.23.8';
import { buildSaleRequest, getBacGatewayApiUrl, getBacSecurityKey, getBacProcessorId, parseGatewayResponse, postGatewayRequest, validateThreeDSecure } from './bac-gateway.ts';

const schema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('list') }).strict(),
  z.object({ operation: z.literal('prepare'), brand: z.enum(['visa','mastercard','amex']) }).strict(),
  z.object({ operation: z.literal('pay'), id: z.string().uuid(), consent: z.literal(true), paymentToken: z.string().min(8).max(200).regex(/^[A-Za-z0-9_-]+$/), threeDSecure: z.unknown(), customer: z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().email().max(254) }).strict() }).strict(),
  z.object({ operation: z.literal('reconcile'), id: z.string().uuid(), approved: z.boolean(), transactionId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(), note: z.string().trim().min(10).max(500) }).strict(),
]);
export const CERTIFICATION_COLUMNS = 'id,reference,declared_brand,amount,currency,status,actor,transaction_id,authorization_code,response_code,created_at,updated_at,expires_at,reconciled_by,reconciliation_note';
const UNKNOWN = 'Resultado incierto. No repitas el cobro. Revisa la referencia en el portal BAC y concilia la prueba.';

// db is the service-role client. The entrypoint must authenticate an active admin first.
export async function handleBacCertification(body: unknown, actor: string, db: any, enabled: boolean, headers: HeadersInit, gateway = { getBacGatewayApiUrl, getBacSecurityKey, getBacProcessorId, postGatewayRequest }) {
  const reply = (data: unknown, status=200) => Response.json(data,{status,headers});
  const parsed=schema.safeParse(body);
  if (!parsed.success) return reply({message:'Solicitud de certificación inválida.'},400);
  const input=parsed.data;
  if (input.operation === 'list') {
    const {data,error}=await db.from('bac_certification_payments').select(CERTIFICATION_COLUMNS).order('created_at',{ascending:false}).limit(30);
    return error ? reply({message:'No se pudo cargar el historial de pruebas.'},503) : reply({enabled, payments:data});
  }
  if (input.operation === 'reconcile') {
    if (input.approved && !input.transactionId) return reply({message:'Se requiere el ID de la transacción verificado en BAC.'},400);
    const {data:row,error}=await db.from('bac_certification_payments').select(CERTIFICATION_COLUMNS).eq('id',input.id).single();
    if(error || !row || row.status !== 'processing' || Date.now()-Date.parse(row.updated_at)<120000) return reply({message:'Solo se concilian pruebas pendientes con más de dos minutos.'},409);
    const {data,error:updateError}=await db.from('bac_certification_payments').update({status:input.approved?'paid':'failed',transaction_id:input.approved?input.transactionId:null,reconciled_by:actor,reconciliation_note:input.note,updated_at:new Date().toISOString()}).eq('id',input.id).eq('status','processing').select(CERTIFICATION_COLUMNS).single();
    return updateError || !data ? reply({message:'No se pudo conciliar. Actualiza el historial.'},409) : reply(data);
  }
  // This separate switch never enables/disables the public booking checkout.
  if (!enabled) return reply({message:'Las pruebas de certificación están deshabilitadas en el servidor.'},503);
  if (input.operation === 'prepare') {
    const {data,error}=await db.rpc('prepare_bac_certification',{p_brand:input.brand,p_actor:actor});
    return error || !data ? reply({message:'No se pudo preparar la prueba. El límite es tres intentos por marca.'},409) : reply(data);
  }
  const authentication=validateThreeDSecure(input.threeDSecure);
  if (!authentication) return reply({message:'Se requiere una autenticación 3DS válida.'},400);
  let url:string, key:string, processor:string|undefined;
  try { url=gateway.getBacGatewayApiUrl(); key=gateway.getBacSecurityKey(); processor=gateway.getBacProcessorId(); }
  catch { return reply({message:'La configuración BAC no está disponible.'},503); }
  if (processor !== '70608880') return reply({message:'El procesador de certificación USD no coincide.'},503);
  const {data:attempt,error}=await db.rpc('begin_bac_certification',{p_id:input.id,p_actor:actor});
  if (error || !attempt) return reply({message:'La prueba ya fue enviada, venció o pertenece a otro administrador. Actualiza el historial.'},409);
  // Neither body, browser nor a tour package can choose the amount.
  const request=buildSaleRequest({type:'sale',securityKey:key,paymentToken:input.paymentToken,amount:'1.00',taxAmount:'0.00',currency:'USD',processorId:processor,orderId:attempt.reference,orderDescription:'BAC certification - USD 1.00',attemptId:attempt.id,customer:input.customer,threeDSecure:authentication});
  let raw:string;
  try { raw=await gateway.postGatewayRequest(url,request); }
  catch { return reply({message:UNKNOWN},502); }
  const result=parseGatewayResponse(raw,attempt.reference);
  const params=new URLSearchParams(raw);
  const declined=params.get('response')==='2' && /^2\d{2}$/.test(result.responseCode) && (!params.has('orderid') || params.get('orderid')===attempt.reference);
  if (!result.approved && !declined) return reply({message:UNKNOWN},502);
  // Only explicit fields are stored; never persist the token, CAVV, PAN, CVV or raw response.
  const {data:saved,error:saveError}=await db.from('bac_certification_payments').update({status:result.approved?'paid':'failed',transaction_id:result.transactionId||null,authorization_code:result.audit.authcode||null,response_code:result.responseCode,updated_at:new Date().toISOString()}).eq('id',attempt.id).eq('status','processing').select(CERTIFICATION_COLUMNS).single();
  if (saveError || !saved) return reply({message:UNKNOWN},502);
  return reply(saved);
}
