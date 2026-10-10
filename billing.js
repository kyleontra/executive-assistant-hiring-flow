// Real employer invoice collection. Payment details are entered only on Stripe.
const BILLING_ENDPOINT = 'https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/stripe-billing';
const $ = selector => document.querySelector(selector);
const escapeBilling = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const billingMoney = (minor,currency) => new Intl.NumberFormat('en',{style:'currency',currency:currency.toUpperCase()}).format(minor/100);
let billingState = {invoices:[],master:false,configured:false}, billingBusy=false, invoiceRequestId=crypto.randomUUID();
async function billingRequest(action,payload={}) {
  const token=await window.getAccessToken?.();
  if(!token) throw new Error('Sign in to view your invoices.');
  const response=await fetch(BILLING_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(30000)});
  const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Billing could not load. Please try again.'); return result;
}
function billingRender() {
  $('#billingAdmin').hidden=!billingState.master;
  $('#invoiceHeading').textContent=billingState.master?'All VA invoices':'Your invoices';
  $('#billingEmpty').hidden=Boolean(billingState.invoices.length);
  $('#billingInvoices').innerHTML=billingState.invoices.map(invoice=>`<tr><td><b>${escapeBilling(invoice.candidate_name)}</b><small>${escapeBilling(invoice.description)} · ${escapeBilling(invoice.period_start)} – ${escapeBilling(invoice.period_end)}</small>${!invoice.livemode?'<small>Test invoice — no real money</small>':''}</td><td>${escapeBilling(invoice.hours)} hrs × ${billingMoney(invoice.rate_minor,invoice.currency)}/hr</td><td><span class="bl-status ${invoice.status==='paid'?'paid':''}">${escapeBilling(({open:'Awaiting payment',paid:'Collected',processing:'Processing',refunded:'Refunded',partially_refunded:'Partially refunded'})[invoice.status])}</span></td><td><b>${billingMoney(invoice.amount_minor,invoice.currency)}</b></td><td>${!billingState.master && ['open','processing'].includes(invoice.status)?`<button class="post-continue" type="button" data-pay="${escapeBilling(invoice.id)}" ${!billingState.configured?'disabled':''}>Pay now</button>`:''}</td></tr>`).join('');
}
async function billingLoad(reconcile=false) {
  if(billingBusy) return; billingBusy=true; $('#billingRefresh').disabled=true;
  try {
    $('#billingNotice').textContent='Loading invoices…';
    billingState=await billingRequest('list');
    if(reconcile && !billingState.master && billingState.configured) {await billingRequest('refresh');billingState=await billingRequest('list');}
    billingRender();
    $('#billingNotice').textContent=billingState.configured ? (billingState.livemode?'Secure payments powered by Stripe.':'Stripe test mode — no real money is collected.') : 'Stripe setup is in progress. Payment checkout is not available yet.';
    if(billingState.master && !$('#invoiceForm [name=employerId]').options.length) {
      const options=await billingRequest('options');
      $('#invoiceForm [name=employerId]').innerHTML='<option value="">Choose employer</option>'+options.employers.map(row=>`<option value="${escapeBilling(row.id)}">${escapeBilling(row.company)} · ${escapeBilling(row.email)}</option>`).join('');
      $('#invoiceForm [name=candidateId]').innerHTML='<option value="">Choose VA</option>'+options.candidates.map(row=>`<option value="${escapeBilling(row.user_id)}">${escapeBilling(row.full_name)}</option>`).join('');
    }
    $('#invoiceForm button').disabled=!billingState.configured;
  } catch(error) {$('#billingNotice').textContent=error.message;}
  finally {billingBusy=false;$('#billingRefresh').disabled=false;}
}
$('#billingRefresh').addEventListener('click',()=>billingLoad(true));
$('#billingInvoices').addEventListener('click',async event=>{
  const button=event.target.closest('[data-pay]'); if(!button) return;
  button.disabled=true; button.textContent='Opening Stripe…';
  try {
    const result=await billingRequest('checkout',{invoiceId:button.dataset.pay});
    if(result.paid) {await billingLoad(); return;}
    const url=new URL(result.url); if(url.protocol!=='https:' || url.hostname!=='checkout.stripe.com') throw new Error('Invalid checkout link. Please contact support.');
    window.location.assign(url.href);
  } catch(error) {$('#billingNotice').textContent=error.message;button.disabled=false;button.textContent='Pay now';}
});
$('#invoiceForm').addEventListener('input',()=>{
  const data=new FormData($('#invoiceForm'));
  const total=Math.round(Number(data.get('hours'))*Math.round(Number(data.get('rate'))*100));
  $('#invoiceTotal').textContent=Number.isFinite(total)?`Total: ${billingMoney(total,String(data.get('currency')))}`:'';
});
$('#invoiceForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
  try {await billingRequest('create',{...Object.fromEntries(new FormData(event.target)),requestId:invoiceRequestId});invoiceRequestId=crypto.randomUUID();event.target.reset();$('#invoiceTotal').textContent='';await billingLoad();}
  catch(error) {$('#billingNotice').textContent=error.message;}
  finally {button.disabled=!billingState.configured;}
});
billingLoad(new URLSearchParams(location.search).get('payment')==='returned');

$('#billingCheck').addEventListener('click',async()=>{
  const button=$('#billingCheck');button.disabled=true;
  try {const connection=await billingRequest('check');$('#billingNotice').textContent=!connection.configured?'Stripe keys and webhook are not configured yet.':`Stripe ${connection.livemode?'live':'test'} account connected · Payments ${connection.chargesEnabled?'enabled':'not enabled'} · Bank payouts ${connection.payoutsEnabled?'enabled':'need Stripe setup'}.`;}
  catch(error) {$('#billingNotice').textContent=error.message;}
  finally {button.disabled=false;}
});
