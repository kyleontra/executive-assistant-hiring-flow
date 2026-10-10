# Stripe VA invoice collection

Implemented:
- Billing uses real employer auth users and verified candidate profiles.
- Master reviewers issue invoices with confirmed hours and agreed rate.
- Employers can access and pay only their own invoices.
- Checkout totals are loaded from private database invoices, never from the employer browser.
- Database checkout claims and Stripe idempotency keys prevent concurrent duplicate sessions.
- Signed Stripe webhook events confirm collection; a return URL never marks an invoice paid.
- Refresh reconciles paid checkout sessions with Stripe if webhook delivery was delayed.
- Refund events update the invoice ledger.
- Master reviewers can check the Stripe account connection without making a payment.
- Collection and VA disbursement are separate. Automatic payouts are not configured.

## Secure configuration

Save these as Supabase Edge Function secrets, never frontend environment variables:

- `STRIPE_SECRET_KEY`: the secret key for the intended Stripe mode. Use a test key for test checkout and the existing live key for real invoice collection.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this destination, in the same Stripe mode.

Webhook destination:

`https://jyxamdvvnoylaxolhlht.supabase.co/functions/v1/stripe-billing`

Subscribe to snapshot events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`

JWT gateway verification is disabled for this function because Stripe does not send Supabase JWTs. The function verifies each webhook with HMAC, and each billing request with Supabase Auth or a valid master reviewer session.

## Verification before enabling real payments

1. Sign in as a master reviewer and open Billing / VA payments.
2. Issue a **test invoice** to a verified test employer for a verified VA.
3. Sign in as that employer, open Billing, and choose Pay now.
4. Complete Stripe sandbox checkout with a Stripe test card.
5. Confirm the invoice becomes Collected in both employer and master views, with the matching Stripe session and payment intent saved.
6. Check cancellation, declined test card, duplicate Pay clicks and webhook redelivery.
7. Confirm another employer cannot see or pay the invoice.
8. Before switching keys to live mode, create the matching live webhook destination and securely save its signing secret. Test invoices remain labelled and cannot be paid under live credentials.

No platform commission, automatic payroll, automatic backup-card charge or guaranteed payout time is imposed by this integration. Invoices require master entry because the existing My Employees hours screen is still example data. Decide the VA payout process separately before using this for payroll.

Current validation: three unit tests, a rollback-only database check of concurrent checkout claims and stable retries, production endpoint authentication/signature rejection, the local invoice form, and the production build passed. The live Stripe webhook is active; its signing secret and the existing live API key are saved in encrypted Supabase Edge Function secrets. Actual Stripe checkout remains untested. Use the master connection check and an authorized employer invoice to verify the account and checkout before relying on it for payroll.
