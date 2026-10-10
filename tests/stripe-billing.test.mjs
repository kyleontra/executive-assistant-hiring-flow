import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInvoice,verifyStripeSignature,matchesPaidSession} from '../supabase/functions/_shared/stripe-billing.mjs';
const valid={hours:7.5,rate:8.25,currency:'usd',periodStart:'2026-10-01',periodEnd:'2026-10-07'};
test('invoice totals come from hours and agreed rate, rounded to minor units',()=>{
  assert.equal(validateInvoice({...valid,amount_minor:1}).amount_minor,6188);
  for(const data of [{hours:-1},{rate:8.251},{currency:'xyz'},{periodEnd:'2026-09-01'},{periodStart:'2026-02-31'}]) assert.throws(()=>validateInvoice({...valid,...data}));
});
test('webhook authenticates raw body, rejects changed data and stale signatures',async()=>{
  const raw='{"id":"evt_test"}', timestamp=Math.floor(Date.now()/1000),secret='whsec_unit_test';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const header=`t=${timestamp},v1=${signature}`;
  assert.equal(await verifyStripeSignature(raw,header,secret),true);
  assert.equal(await verifyStripeSignature(raw+' ',header,secret),false);
  assert.equal(await verifyStripeSignature(raw,header,secret,Date.now()+600000),false);
  assert.equal(await verifyStripeSignature(raw,header,'other'),false);
});
test('only a paid matching Stripe session can settle an invoice',()=>{
  const invoice={id:'inv',checkout_session_id:'cs_test',amount_minor:1000,currency:'usd',livemode:false};
  const session={id:'cs_test',metadata:{invoice_id:'inv'},amount_total:1000,currency:'usd',livemode:false,payment_status:'paid'};
  assert.equal(matchesPaidSession(invoice,session),true);
  for(const changed of [{payment_status:'unpaid'},{id:'different'},{amount_total:1},{currency:'zar'},{livemode:true},{metadata:{invoice_id:'other'}}]) assert.equal(matchesPaidSession(invoice,{...session,...changed}),false);
});
