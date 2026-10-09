# Subscriptions, payments, and referrals

The frontend remains a static Svelte/Vite app. Supabase Postgres owns membership
expiry, referral rewards, and payment fulfilment. The `sketch-billing` Edge
Function owns Razorpay orders, signature verification, and captured-payment
checks. No new frontend environment variables or payment secrets are needed.

## Product rules

- Signup offers Free, Yearly, and Lifetime, for email and Google accounts.
  Selection is an intention, **not proof of payment**. Every new account receives
  one three-calendar-month free trial on its first confirmed sign-in to this app.
  Selecting a paid plan opens the subscription page after sign-in.
- A captured yearly purchase adds one calendar year to the later of the current
  expiry and the payment-verification time. This retains unused trial time and
  referral rewards. It is a one-time purchase, not an auto-renewing mandate.
- A captured lifetime purchase removes expiry. Subsequent late yearly callbacks
  cannot downgrade lifetime access. Lifetime accounts cannot start new purchases.
- All three plans expose the same features while active. Expired accounts can
  subscribe, refresh access, share an unused referral link, and sign out, but the
  comparison workspace is unmounted. Existing browser-local data is not deleted.
- Each account has one referral link with two reward slots. A new referred user
  must confirm their email and open the app. Each such activation rewards the
  inviter once with three calendar months, up to six months total. Row locks and
  unique referred-user records prevent replay/concurrent requests exceeding two.
  For expired accounts, rewards start today rather than being lost in the past.
- Invalid, self, exhausted, and retroactive referrals do not earn rewards or
  prevent signup. A fully used link can still open signup, but cannot reward any
  further users. Lifetime users can invite friends, but have no expiry to extend.
- Email signup captures referral/plan metadata at account creation. Google intent
  is kept in session storage through OAuth and accepted only on first activation.
  Existing users cannot change their entitlement or claim a signup referral by
  editing metadata or replaying activation. Keep email confirmation enabled.
- Existing shared-identity accounts get one trial beginning at migration time and
  cannot be referred retroactively. This rollout choice must be reviewed before
  applying the migration. Months use UTC calendar arithmetic (month ends clamp).

Prices are intentionally not chosen by the code. Paid plans start disabled and
show **Price coming soon** until the owner supplies prices and Razorpay setup.
The catalog defaults to INR; amounts are integer paise (₹1 = 100 paise). Confirm
currency and any tax-inclusive pricing before enabling checkout.

## Deployment setup (owner approval required)

Do not deploy the new frontend before its backend is ready: missing membership
configuration blocks workspace access rather than bypassing the subscription.
Use a staging Supabase project and Razorpay Test Mode first.

1. Review and apply `supabase/migrations/202610090001_memberships.sql` to the
   **same shared Supabase project** used by authentication. Use the Supabase SQL
   editor or your existing migration workflow. All new tables/functions are
   `sketch_`-prefixed. The migration adds a trigger to `auth.users`, so it also
   provisions membership rows for signups from the other app, without changing
   auth metadata or that app's access policy. Test both apps' signups in staging.
2. In Supabase **Edge Function secrets**, enter `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET` securely.
   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge
   runtime. Never put private keys in `VITE_` variables, chat, or tracked files.
3. Deploy the Edge Function with the reviewed configuration:

   ```sh
   supabase functions deploy sketch-billing --project-ref <shared-project-ref>
   ```

   `verify_jwt = false` is necessary for public prices and Razorpay webhooks.
   Member operations **explicitly authenticate** the bearer token using
   Supabase `auth.getUser(token)`, including confirmed email. Webhooks authenticate
   the raw request body using their separate Razorpay HMAC secret.
4. In Razorpay's matching Test/Live dashboard, enable automatic payment capture
   and register this webhook URL, using the same webhook secret:

   ```text
   https://<shared-project-ref>.supabase.co/functions/v1/sketch-billing/webhook
   ```

   Subscribe to `payment.captured`. The handler also fetches the payment directly
   from Razorpay to verify status, order, amount, and currency. Other events and
   orders belonging to another app are ignored. A transient failure returns
   non-2xx so Razorpay retries; duplicate deliveries cannot extend access twice.
   Refund/dispute automation is not implemented; reconcile those in the merchant
   dashboard and adjust membership manually under your refund policy.
5. Configure the two reviewed prices in `public.sketch_plans`, using integer
   **paise**, `currency = 'INR'`, and `enabled = true`. Use the Supabase table
   editor or parameterized SQL. Browser clients have read-only catalog access;
   order creation always looks up the server's price, never a browser amount.
   Missing any Razorpay secret also disables paid checkout in the price response.
6. Deploy the frontend with the same two existing public Supabase build values.
   The existing SPA fallback also serves `/pricing` and `/?ref=...`. Allowlist
   the actual origin's auth callback/reset URLs as described in the README.
   If using a CSP, allow Razorpay's checkout script, frames, and network requests
   according to its current Standard Checkout documentation.

Go live only after testing real email confirmation and Google referral/signup
flows, both paid plans in Razorpay Test Mode, dismissed/failed checkout, late
capture with the browser closed, duplicate callbacks/webhooks, expired renewal,
and the third referral. Replace Test Mode credentials and webhook configuration
with matching Live Mode values only after merchant activation and review.

## Verification

```sh
bun run build
bun test tests/*.test.ts
bunx deno check supabase/functions/sketch-billing/index.ts

# Disposable Vite with the README's mock Supabase URL/key:
bun run tests/auth.browser.ts http://localhost:5174

# Empty disposable PostgreSQL cluster/database, NEVER a shared/live database:
createdb sketch_membership_test
psql -d sketch_membership_test -f tests/memberships.sql
```

The PostgreSQL test requires a superuser and defines minimal Supabase Auth
fixtures/roles. The browser and billing tests mock remote identity/payment HTTP
responses; they do **not** establish live Razorpay, SMTP, OAuth, or webhook setup.

RLS and service-only fulfilment protect subscription records and referral limits.
The workspace gate is still browser UI, not DRM: this application's image tools
and history run locally, so modified JavaScript can bypass the UI. Any future
remote feature must check active membership at its own trusted server boundary.
