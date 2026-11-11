import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const base=process.env.ADMIN_TEST_BASE_URL??'http://localhost:5175';
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'admin@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
async function fixture(role='admin',enabled=true){
  const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1366,height:1000}});const calls=[];const rows=[];
  await page.route('https://admin-test.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/token'))return route.fulfill({json:{access_token:'x',refresh_token:'y',token_type:'bearer',expires_in:3600,user}});
    if(path.endsWith('/profiles'))return route.fulfill({json:{...user,full_name:'Test Admin',role,active:true}});
    if(path.endsWith('/user'))return route.fulfill({json:user});
    if(path.endsWith('/admin-bac-certification')){
      const body=route.request().postDataJSON();calls.push(body);
      if(body.operation==='list')return route.fulfill({json:{enabled,payments:rows}});
      if(body.operation==='prepare'){
        rows.push({id:'00000000-0000-4000-8000-000000000003',reference:'BAC-TEST-0001',declared_brand:body.brand,amount:1,currency:'USD',status:'prepared',actor:user.id,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()});return route.fulfill({json:rows[0]});
      }
      if(body.operation==='pay'){Object.assign(rows[0],{status:'paid',transaction_id:'TEST-TXN',authorization_code:'TEST-AUTH'});return route.fulfill({json:rows[0]});}
    }
    return route.fulfill({json:[]});
  });
  await page.route('https://secure.nmi.com/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().includes('Collect.js')?
    `window.CollectJS={configure(c){this.c=c;for(const field of Object.values(c.fields)){const f=document.createElement('iframe');f.title=field.title;f.style.cssText='width:100%;height:28px;border:0';document.querySelector(field.selector).append(f);}c.fieldsAvailableCallback();},startPaymentRequest(){this.c.callback({token:'test-token-123'});}};`:
    `window.Gateway={create(){return {on(){},get3DSecure(){return {createUI(){const h={};return {on(k,f){h[k]=f;},start(){h.complete({cavv:'TEST',eci:'05',cardHolderAuth:'verified',threeDsVersion:'2.2.0'});}}}}}}}};`}));
  try {
    await page.goto(`${base}/admin/login`);
    await page.getByPlaceholder('admin@example.com').fill(user.email);
    await page.getByPlaceholder('Password').fill('test-password');
    await page.getByRole('button',{name:'Entrar al panel'}).click();
    await expect(page.getByText('Reservas totales')).toBeVisible();
    await page.goto(`${base}/admin/bac-certification`);
    return {browser,page,calls};
  } catch(error) { await browser.close(); throw error; }
}
test('private certification uses an explicit consent, fixed total and separate endpoint; responsive evidence',async()=>{
  const f=await fixture();try{
    await expect(f.page.locator('.admin-page').getByRole('heading',{name:'Pruebas BAC · USD 1',exact:true})).toBeVisible();
    const prepare=f.page.getByRole('button',{name:'Preparar formulario de USD 1.00'});await expect(prepare).toBeDisabled();
    await f.page.getByLabel('Nombre del titular').fill('Test User');await f.page.getByLabel('Correo del titular').fill('test@example.com');await f.page.getByRole('checkbox').check();
    await f.page.screenshot({path:'tmp/bac-certification-desktop.png',fullPage:true});
    await prepare.click();await expect(f.page.getByRole('button',{name:'Pagar USD 1.00',exact:true})).toBeEnabled();
    assert.equal(f.calls.filter(c=>c.operation==='pay').length,0,'preparing a form must never charge');
    await f.page.setViewportSize({width:390,height:844});await f.page.screenshot({path:'tmp/bac-certification-mobile.png',fullPage:true});
    assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await f.page.getByRole('button',{name:'Pagar USD 1.00',exact:true}).click();await expect(f.page.getByText('BAC aprobó USD 1.00.',{exact:false})).toBeVisible();
    const pay=f.calls.filter(c=>c.operation==='pay');assert.equal(pay.length,1);assert.equal(pay[0].consent,true);assert.equal('amount' in pay[0],false);await expect(f.page.getByText('Transacción: TEST-TXN',{exact:false})).toBeVisible();
  }finally{await f.browser.close();}
});
test('editor cannot open certification or find its navigation item',async()=>{
  const f=await fixture('editor');try{await expect(f.page.getByRole('alert')).toContainText('Solo los administradores');await expect(f.page.getByRole('link',{name:'Pruebas BAC · USD 1'})).toHaveCount(0);assert.equal(f.calls.length,0);}finally{await f.browser.close();}
});
test('disabled server configuration never enables preparation',async()=>{
  const f=await fixture('admin',false);try{await expect(f.page.getByText('Pruebas deshabilitadas en el servidor.',{exact:false})).toBeVisible();await expect(f.page.getByRole('button',{name:'Preparar formulario de USD 1.00'})).toBeDisabled();}finally{await f.browser.close();}
});
