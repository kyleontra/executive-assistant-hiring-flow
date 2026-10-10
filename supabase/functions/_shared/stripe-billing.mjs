export function validateInvoice(input) {
  const hours = Number(input.hours), rate = Number(input.rate);
  const currency = String(input.currency || '').toLowerCase();
  if (!['usd','zar','gbp','eur'].includes(currency)) throw new Error('Choose a supported currency.');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 744 || Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001) throw new Error('Enter valid hours, up to 744, with at most two decimals.');
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) throw new Error('Enter a valid hourly rate with at most two decimals.');
  const rateMinor = Math.round(rate * 100);
  const amountMinor = Math.round(hours * rateMinor);
  if (amountMinor < 100 || amountMinor > 10000000) throw new Error('Invoice total must be between 1 and 100,000 currency units.');
  const dates = [input.periodStart,input.periodEnd].map(String);
  if (dates.some(v => !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || (Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) !== v)) || dates[1] < dates[0]) throw new Error('Enter a valid work period.');
  return { hours, rate_minor: rateMinor, amount_minor: amountMinor, currency, period_start: dates[0], period_end: dates[1] };
}
export async function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  const parts = String(header || '').split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!secret || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
  return signatures.some(signature => {
    if (signature.length !== expected.length) return false;
    let difference = 0; for(let i=0;i<expected.length;i++) difference |= expected.charCodeAt(i)^signature.charCodeAt(i);
    return difference === 0;
  });
}
export function matchesPaidSession(invoice, session) {
  return session.payment_status === 'paid' && session.id === invoice.checkout_session_id
    && session.metadata?.invoice_id === invoice.id && session.amount_total === invoice.amount_minor
    && session.currency === invoice.currency && session.livemode === invoice.livemode;
}
