import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { MASTER_TOKEN_PATTERN, masterAccount } from '../_shared/master-access.mjs';
import { validateInvoice, verifyStripeSignature, matchesPaidSession } from '../_shared/stripe-billing.mjs';
const origins = new Set(['https://www.hirefromsa.com','https://hirefromsa.com','http://127.0.0.1:5173','http://localhost:5173']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = 'id,employer_user_id,candidate_id,candidate_name,description,period_start,period_end,hours,rate_minor,amount_minor,currency,status,livemode,created_at,paid_at,checkout_session_id,payment_intent_id';
Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin) || origin === 'https://supabase.com'?origin:'https://www.hirefromsa.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',Vary:'Origin'};
  const reply = (data: unknown,status = 200) => new Response(JSON.stringify(data),{status,headers});
  if(request.method === 'OPTIONS') return reply({});
  if(request.method !== 'POST') return reply({error:'Method not allowed'},405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const secret = Deno.env.get('STRIPE_SECRET_KEY') || '';
  const ready = /^(sk|rk)_(test|live)_/.test(secret) && /^whsec_/.test(Deno.env.get('STRIPE_WEBHOOK_SECRET') || '');
  const live = /^(sk|rk)_live_/.test(secret);
  const stripe = async(path: string,params?: Record<string,string>,idempotency?: string) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(20000)});
    const result = await response.json(); if(!response.ok) throw new Error('Stripe could not complete this request. Please try again or contact billing support.'); return result;
  };
  const checkConnection = async() => {
    if(!ready) return reply({configured:false});
    const account=await stripe('account');
    return reply({configured:true,livemode:live,accountId:account.id,country:account.country,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled});
  };
  const recordPaid = async(session: any) => {
    const id = session.metadata?.invoice_id; if(!uuid.test(id || '')) return;
    const {data: invoice,error} = await admin.from('va_payment_invoices').select(fields).eq('id',id).maybeSingle(); if(error) throw error;
    if(!invoice || !matchesPaidSession(invoice,session)) return;
    const {error: updateError} = await admin.from('va_payment_invoices').update({status:'paid',paid_at:new Date().toISOString(),payment_intent_id:session.payment_intent}).eq('id',id).in('status',['open','processing']); if(updateError) throw updateError;
  };
  try {
    if(request.headers.has('stripe-signature')) {
      const raw = await request.text();
      if(!await verifyStripeSignature(raw,request.headers.get('stripe-signature'),Deno.env.get('STRIPE_WEBHOOK_SECRET'))) return reply({error:'Invalid signature'},400);
      const event = JSON.parse(raw), session = event.data?.object;
      if(event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await recordPaid(session);
      if(event.type === 'checkout.session.async_payment_failed') {
        const {error} = await admin.from('va_payment_invoices').update({status:'open'}).eq('checkout_session_id',session.id).eq('status','processing'); if(error) throw error;
      }
      if(event.type === 'charge.refunded') {
        const {error} = await admin.from('va_payment_invoices').update({status:session.refunded?'refunded':'partially_refunded'}).eq('payment_intent_id',session.payment_intent).eq('livemode',event.livemode); if(error) throw error;
      }
      return reply({received:true});
    }
    // The Supabase dashboard can run this read-only diagnostic with an existing
    // project secret key. It cannot issue invoices or start checkout this way.
    const projectKey = request.headers.get('apikey') || '';
    const projectSecretKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'));
    if(projectKey && projectSecretKeys.includes(projectKey)) {
      const diagnostic = await request.json();
      return diagnostic.action === 'check' ? await checkConnection() : reply({error:'Project-key access is limited to the connection check.'},403);
    }
    if(origin && !origins.has(origin)) return reply({error:'Origin not allowed'},403);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
    const master = MASTER_TOKEN_PATTERN.test(token) ? await masterAccount(admin,token) : null;
    const reviewer = Boolean(master?.can_review);
    let user: any = null;
    if(!master && token) { const result = await admin.auth.getUser(token); if(!result.error) user=result.data.user; }
    if(!reviewer && (!user?.email_confirmed_at || user.app_metadata?.account_role !== 'employer')) return reply({error:'Sign in with a verified employer account.'},401);
    const body = await request.json();
    if(body.action === 'check' && reviewer) {
      return await checkConnection();
    }
    if(body.action === 'list') {
      let query = admin.from('va_payment_invoices').select(fields).order('created_at',{ascending:false}).limit(500);
      if(!reviewer) query=query.eq('employer_user_id',user.id);
      const {data,error} = await query; if(error) throw error;
      return reply({invoices:data,configured:ready,livemode:live,master:reviewer});
    }
    if(body.action === 'options' && reviewer) {
      const employers: any[]=[]; let page=1;
      while(page<=100) { const {data,error} = await admin.auth.admin.listUsers({page,perPage:1000}); if(error) throw error;
        employers.push(...data.users.filter(u=>u.app_metadata?.account_role==='employer').map(u=>({id:u.id,email:u.email,company:u.user_metadata?.company_name || u.email})));
        if(data.users.length<1000) break; page++; }
      const {data:candidates,error} = await admin.from('candidate_profiles').select('user_id,full_name').eq('verification_status','verified').order('full_name').limit(1000); if(error) throw error;
      return reply({employers,candidates});
    }
    if(body.action === 'create' && reviewer) {
      if(!ready) return reply({error:'Stripe credentials and webhook must be configured first.'},503);
      if(!uuid.test(body.employerId || '') || !uuid.test(body.candidateId || '') || !uuid.test(body.requestId || '')) return reply({error:'Select an employer and VA.'},400);
      const {data:employer,error:employerError}=await admin.auth.admin.getUserById(body.employerId); if(employerError || employer.user?.app_metadata?.account_role!=='employer') return reply({error:'Employer not found'},400);
      const {data:candidate,error:candidateError}=await admin.from('candidate_profiles').select('full_name').eq('user_id',body.candidateId).eq('verification_status','verified').single(); if(candidateError) return reply({error:'Verified VA not found'},400);
      const values=validateInvoice(body);
      const description=String(body.description||'VA services').trim().slice(0,300);
      const {data,error}=await admin.from('va_payment_invoices').upsert({id:body.requestId,employer_user_id:body.employerId,candidate_id:body.candidateId,candidate_name:candidate.full_name,description,...values,livemode:live,created_by:master!.id},{onConflict:'id',ignoreDuplicates:true}).select('id'); if(error) throw error;
      return reply({created:true,id:body.requestId});
    }
    if(body.action === 'checkout' && !reviewer) {
      if(!ready) return reply({error:'Payments are not configured yet. Please contact billing support.'},503);
      const {data:invoice,error}=await admin.from('va_payment_invoices').select(fields).eq('id',body.invoiceId).eq('employer_user_id',user.id).single(); if(error || !invoice) return reply({error:'Invoice not found'},404);
      if(invoice.livemode!==live) return reply({error:'This invoice belongs to a different Stripe payment mode.'},409);
      if(!['open','processing'].includes(invoice.status)) return reply({error:'This invoice is already settled.'},409);
      if(invoice.checkout_session_id) {
        const existing=await stripe(`checkout/sessions/${invoice.checkout_session_id}`);
        if(existing.payment_status==='paid') {await recordPaid(existing); return reply({paid:true});}
        if(existing.status==='open') return reply({url:existing.url});
        if(existing.status==='complete') return reply({error:'This payment is still processing. Please refresh shortly.'},409);
      }
      const requestedBase=origins.has(origin)?origin:'https://www.hirefromsa.com';
      const {data:claim,error:claimError}=await admin.rpc('claim_va_checkout',{invoice_id:invoice.id,owner_id:user.id,expected_session:invoice.checkout_session_id,return_origin:requestedBase}); if(claimError) throw claimError;
      if(!claim?.length) return reply({error:'Checkout is being prepared. Try again shortly.'},409);
      const generation=claim[0].generation;
      const base=claim[0].origin;
      const session=await stripe('checkout/sessions',{'mode':'payment','payment_method_types[0]':'card','customer_email':user.email,'client_reference_id':invoice.id,'metadata[invoice_id]':invoice.id,'payment_intent_data[metadata][invoice_id]':invoice.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':invoice.currency,'line_items[0][price_data][unit_amount]':String(invoice.amount_minor),'line_items[0][price_data][product_data][name]':`${invoice.candidate_name} · ${invoice.description}`,'line_items[0][price_data][product_data][description]':`${invoice.hours} hours · ${invoice.period_start} to ${invoice.period_end}`,'success_url':`${base}/billing.html?payment=returned`,'cancel_url':`${base}/billing.html?payment=cancelled`,'expires_at':String(claim[0].expires_at)},`va-invoice-${invoice.id}-${generation}`);
      const {error:saveError}=await admin.from('va_payment_invoices').update({checkout_session_id:session.id,checkout_locked_until:null}).eq('id',invoice.id).eq('checkout_generation',generation); if(saveError) throw saveError;
      return reply({url:session.url});
    }
    if(body.action === 'refresh' && !reviewer && ready) {
      const {data,error}=await admin.from('va_payment_invoices').select(fields).eq('employer_user_id',user.id).in('status',['open','processing']).not('checkout_session_id','is',null).limit(20); if(error) throw error;
      for(const invoice of data || []) await recordPaid(await stripe(`checkout/sessions/${invoice.checkout_session_id}`));
      return reply({refreshed:true});
    }
    return reply({error:'Unknown or unauthorized billing action'},403);
  } catch(error) { console.error('Billing request failed:',error instanceof Error?error.name:'Error'); return reply({error:error instanceof Error && error.message.startsWith('Enter')?error.message:'Could not complete billing request. Please try again.'},400); }
});
