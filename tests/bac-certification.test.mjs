import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { loadTs } from './support/load-ts.mjs';

const actor='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003';
const authentication={cavv:'TEST',eci:'05',cardHolderAuth:'verified',threeDsVersion:'2.2.0'};
const payload={operation:'pay',id,consent:true,paymentToken:'test-token-123',threeDSecure:authentication,customer:{fullName:'Test User',email:'test@example.com'}};
const env={BAC_GATEWAY_URL:'https://secure.nmi.com',BAC_SECURITY_KEY:'fake-private',BAC_PROCESSOR_ID:'70608880',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-role'};

function harness({raw='response=1&response_code=100&transactionid=txn1&authcode=AUTH&orderid=BAC-TEST-1',networkError=false,saveError=false}={}) {
  const row={id,actor,reference:'BAC-TEST-1',amount:1,currency:'USD',status:'prepared',declared_brand:'visa',updated_at:new Date(Date.now()-180000).toISOString()};
  const calls={posts:[],begins:0,patches:[]};
  const db={
    async rpc(name) { if(name==='begin_bac_certification') { calls.begins++; if(row.status!=='prepared') return {error:{}}; row.status='processing'; return {data:{...row}}; } return {data:row}; },
    from(table) { assert.equal(table,'bac_certification_payments','must never write bookings/payments'); let patch; let filters=[]; return {
      select(){return this;},eq(k,v){filters.push([k,v]);return this;},update(p){patch=p;calls.patches.push(p);return this;},order(){return this;},limit(){return Promise.resolve({data:[row]});},
      async single(){if(patch){if(saveError||filters.some(([k,v])=>row[k]!==v))return {error:{}};Object.assign(row,patch);} return {data:{...row}};}
    }; }
  };
  const context=vm.createContext({z,Response,Headers,URLSearchParams,TextEncoder,AbortController,setTimeout,clearTimeout,crypto:globalThis.crypto,Deno:{env:{get:k=>env[k]}},console});
  loadTs('supabase/functions/_shared/bac-gateway.ts',context);
  loadTs('supabase/functions/_shared/bac-certification.ts',context);
  const gateway={getBacGatewayApiUrl:()=>env.BAC_GATEWAY_URL+'/api/transact.php',getBacSecurityKey:()=>env.BAC_SECURITY_KEY,getBacProcessorId:()=>env.BAC_PROCESSOR_ID,async postGatewayRequest(url,body){calls.posts.push({url,body});if(networkError)throw Error('timeout');return raw;}};
  return {row,calls,context,db,run:(body=payload,enabled=true)=>context.handleBacCertification(body,actor,db,enabled,{},gateway)};
}

test('certification requires enable flag, explicit consent, valid 3DS and rejects client amounts',async()=>{
  for(const [body,enabled,status] of [[payload,false,503],[{...payload,consent:false},true,400],[{...payload,amount:100},true,400],[{...payload,currency:'CRC'},true,400],[{...payload,threeDSecure:{...authentication,eci:'07'}},true,400]]){
    const h=harness();assert.equal((await h.run(body,enabled)).status,status);assert.equal(h.calls.posts.length,0);assert.equal(h.calls.begins,0);
  }
});
test('certification charges exactly USD 1 once and stores only safe evidence',async()=>{
  const h=harness();const result=await h.run();assert.equal(result.status,200);assert.equal(h.row.status,'paid');
  const body=h.calls.posts[0].body;assert.equal(body.get('amount'),'1.00');assert.equal(body.get('currency'),'USD');assert.equal(body.get('tax'),'0.00');assert.equal(body.get('type'),'sale');assert.equal(body.get('processor_id'),'70608880');
  assert.equal(h.row.authorization_code,'AUTH');assert.equal((await h.run()).status,409);assert.equal(h.calls.posts.length,1);
  const stored=JSON.stringify(h.calls.patches);for(const forbidden of ['test-token-123','fake-private','cavv','payment_token','customer'])assert.equal(stored.includes(forbidden),false);
});
test('timeouts, malformed responses and failed persistence stay locked; only definite declines unlock',async()=>{
  for(const options of [{networkError:true},{raw:''},{raw:'response=1&response_code=100'},{raw:'response=2&response_code=200&orderid=WRONG'},{saveError:true}]){
    const h=harness(options);assert.equal((await h.run()).status,502);assert.equal(h.row.status,'processing');assert.equal((await h.run()).status,409);assert.equal(h.calls.posts.length,1);
  }
  const h=harness({raw:'response=2&response_code=200&orderid=BAC-TEST-1'});assert.equal((await h.run()).status,200);assert.equal(h.row.status,'failed');
});
test('reconciliation waits, needs proof and never calls the gateway even when certification disabled',async()=>{
  const h=harness();h.row.status='processing';h.row.updated_at=new Date().toISOString();
  const body={operation:'reconcile',id,approved:true,transactionId:'verified1',note:'Verified in BAC portal'};
  assert.equal((await h.run(body,false)).status,409);h.row.updated_at=new Date(Date.now()-180000).toISOString();
  assert.equal((await h.run({...body,transactionId:undefined},false)).status,400);
  assert.equal((await h.run(body,false)).status,200);assert.equal(h.row.reconciled_by,actor);assert.equal(h.calls.posts.length,0);
});
test('entrypoint denies absent/invalid sessions, editors and inactive admins before handler',async()=>{
  for(const role of ['missing','invalid','editor','inactive','admin']){
    let handler,called=false;
    const ctx=vm.createContext({Response,Headers,console,Deno:{env:{get:k=>env[k]}},serve:fn=>handler=fn,withCors:fn=>fn,corsHeaders:()=>({}),corsPreflight:()=>new Response(null),
      createClient:()=>({auth:{getUser:async()=>role==='invalid'?{error:{}}:{data:{user:{id:actor}}}},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{role:role==='editor'?'editor':'admin',active:role!=='inactive'}})})}),
      handleBacCertification:()=>{called=true;return Response.json({ok:true});}});
    const src=fs.readFileSync('supabase/functions/admin-bac-certification/index.ts','utf8').replace(/^import [\s\S]*?;\r?\n/gm,'');
    vm.runInContext(ts.transpile(src,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),ctx);
    const res=await handler(new Request('https://example.test',{method:'POST',headers:role==='missing'?{}:{authorization:'Bearer test'},body:'{}'}));
    assert.equal(res.status,role==='admin'?200:role==='missing'||role==='invalid'?401:403);assert.equal(called,role==='admin');
  }
});
test('database locks duplicates, enforces one dollar, expiry, ownership, role isolation and attempt ceiling',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}'),('${other}');`);
    await db.exec(fs.readFileSync('supabase/migrations/202611100001_bac_certification.sql','utf8'));
    const prep=async brand=>(await db.query('select * from public.prepare_bac_certification($1,$2)',[brand,actor])).rows[0];
    const row=await prep('visa');assert.equal(Number(row.amount),1);assert.equal((await prep('visa')).id,row.id);
    await assert.rejects(db.query('select public.begin_bac_certification($1,$2)',[row.id,other]));
    await assert.rejects(db.query('update public.bac_certification_payments set amount=2 where id=$1',[row.id]));
    await db.query('select public.begin_bac_certification($1,$2)',[row.id,actor]);
    await assert.rejects(db.query('select public.begin_bac_certification($1,$2)',[row.id,actor]));
    assert.equal((await prep('visa')).status,'processing');
    await db.query("update public.bac_certification_payments set status='paid',transaction_id='txn1' where id=$1",[row.id]);assert.equal((await prep('visa')).status,'paid');
    for(let i=0;i<3;i++){const r=await prep('amex');await db.query("update public.bac_certification_payments set status='failed' where id=$1",[r.id]);}await assert.rejects(prep('amex'));
    const expired=await prep('mastercard');await db.query("update public.bac_certification_payments set expires_at=now()-interval '1 minute' where id=$1",[expired.id]);await assert.rejects(db.query('select public.begin_bac_certification($1,$2)',[expired.id,actor]));
    for(const role of ['anon','authenticated']){assert.equal((await db.query(`select has_table_privilege('${role}','public.bac_certification_payments','select') as allowed`)).rows[0].allowed,false);assert.equal((await db.query(`select has_function_privilege('${role}','public.begin_bac_certification(uuid,uuid)','execute') as allowed`)).rows[0].allowed,false);}
    assert.equal((await db.query("select to_regclass('public.bookings') as bookings")).rows[0].bookings,null);
  }finally{await db.close();}
});
