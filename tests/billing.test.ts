import { afterAll, beforeEach, expect, test } from 'bun:test';
import { plugin } from 'bun';
import { createHmac } from 'node:crypto';

// Run the actual Edge handler under Bun, adapting only Deno's env/serve APIs.
// Supabase and Razorpay HTTP responses are disposable test fixtures.
const userId = '00000000-0000-4000-8000-000000000001';
const secret = 'test-only-razorpay-secret';
const webhookSecret = 'test-only-webhook-secret';
const order = { order_id: 'order_fixture', user_id: userId, plan: 'yearly', amount: 127500, currency: 'INR' };
let payment: Record<string, unknown>;
let fulfilled = false;
let enabled = true;
let memberPlan = 'free';
let createdAmount = 0;
let handler: (request: Request) => Promise<Response>;
const mock = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/auth/v1/user') {
      return request.headers.get('Authorization') === 'Bearer verified-test-user'
        ? Response.json({ id: userId, email: 'artist@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' })
        : Response.json({ message: 'Invalid token' }, { status: 401 });
    }
    if (url.pathname.endsWith('/sketch_plans')) {
      const plans = [{ id: 'free', amount: null, currency: 'INR', enabled: true },
        { id: 'yearly', amount: order.amount, currency: 'INR', enabled }];
      return Response.json(url.searchParams.has('id') ? plans[1] : plans);
    }
    if (url.pathname.endsWith('/sketch_memberships')) return Response.json({ user_id: userId, activated_at: '2026-01-01T00:00:00Z', plan: memberPlan });
    if (url.pathname.endsWith('/sketch_orders')) {
      if (request.method === 'POST') {
        const body = await request.json();
        expect(body.amount).toBe(order.amount);
        expect(body.user_id).toBe(userId);
        return new Response(null, { status: 201 });
      }
      if (url.searchParams.get('order_id') !== `eq.${order.order_id}` ||
        (url.searchParams.has('user_id') && url.searchParams.get('user_id') !== `eq.${userId}`)) {
        return Response.json({ message: 'Unknown order' }, { status: 406 });
      }
      return Response.json(order);
    }
    if (url.pathname.endsWith('/rpc/sketch_fulfil_order')) {
      const body = await request.json();
      expect(body.p_order_id).toBe(order.order_id);
      expect(body.p_payment_id).toBe('pay_fixture');
      fulfilled = true;
      return Response.json(null);
    }
    return Response.json({ message: 'Unexpected mock request' }, { status: 500 });
  }
});
const env: Record<string, string> = { SUPABASE_URL: mock.url.origin, SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role',
  RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: secret, RAZORPAY_WEBHOOK_SECRET: webhookSecret };
const previousDeno = (globalThis as any).Deno;
(globalThis as any).Deno = { env: { get: (name: string) => env[name] }, serve: (next: typeof handler) => { handler = next; } };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://api.razorpay.com/v1/')) {
    if (url.endsWith('/orders')) {
      createdAmount = JSON.parse(init!.body as string).amount;
      return Response.json({ id: order.order_id });
    }
    return Response.json(payment);
  }
  if (!url.startsWith(mock.url.origin)) throw new Error('Unexpected external request');
  return realFetch(input, init);
}) as typeof fetch;
plugin({ name: 'deno-npm-import', setup(build) {
  build.onResolve({ filter: /^@supabase\/supabase-js@/, namespace: 'npm' }, () => ({
    path: new URL(import.meta.resolve('@supabase/supabase-js')).pathname, namespace: 'file'
  }));
} });
await import('../supabase/functions/sketch-billing/index.ts');
afterAll(async () => { globalThis.fetch = realFetch; (globalThis as any).Deno = previousDeno; await mock.stop(true); });
beforeEach(() => {
  payment = { id: 'pay_fixture', order_id: order.order_id, amount: order.amount, currency: 'INR', status: 'captured' };
  fulfilled = false;
  enabled = true;
  memberPlan = 'free';
  env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
});
const sign = (key: string, body: string) => createHmac('sha256', key).update(body).digest('hex');
const signature = sign(secret, `${order.order_id}|pay_fixture`);
const verifyBody = { action: 'verify-payment', order_id: order.order_id, payment_id: 'pay_fixture', signature };
const invoke = (body: unknown, token = 'verified-test-user') => handler(new Request('https://example.test/sketch-billing', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}));
const webhook = (raw: string, signature: string) => handler(new Request('https://example.test/sketch-billing/webhook', {
  method: 'POST', headers: { 'x-razorpay-signature': signature }, body: raw
}));

test('order price and owner come from the server, and unavailable/lifetime plans cannot be purchased', async () => {
  expect((await invoke({ action: 'create-order', plan: 'yearly', amount: 1, user_id: 'attacker' })).status).toBe(200);
  expect(createdAmount).toBe(127500);
  enabled = false;
  expect((await invoke({ action: 'create-order', plan: 'yearly' })).status).toBe(409);
  enabled = true;
  memberPlan = 'lifetime';
  expect((await invoke({ action: 'create-order', plan: 'yearly' })).status).toBe(400);
});

test('payments require verified identity, the stored order, a valid signature, and a matching captured payment', async () => {
  expect((await invoke(verifyBody, 'forged-user')).status).toBe(401);
  expect((await invoke({ ...verifyBody, order_id: 'order_other_user' })).status).toBe(400);
  expect((await invoke({ ...verifyBody, signature: '0'.repeat(64) })).status).toBe(400);
  expect(fulfilled).toBe(false);
  for (const change of [{ status: 'authorized' }, { status: 'failed' }, { amount: 127501 }, { currency: 'USD' }, { order_id: 'order_different' }, { id: 'pay_different' }]) {
    const original = payment;
    payment = { ...payment, ...change };
    expect((await invoke(verifyBody)).status).toBe(503);
    expect(fulfilled).toBe(false);
    payment = original;
  }
  expect(await (await invoke(verifyBody)).json()).toEqual({ verified: true });
  expect(fulfilled).toBe(true);
});

test('webhooks authenticate raw bytes and independently confirm capture; unrelated events do not grant access', async () => {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });
  const signed = sign(webhookSecret, raw);
  expect((await webhook(raw + ' ', signed)).status).toBe(400);
  expect((await webhook(raw, 'invalid')).status).toBe(400);
  expect(fulfilled).toBe(false);
  payment.status = 'authorized';
  expect((await webhook(raw, signed)).status).toBe(503);
  expect(fulfilled).toBe(false);
  payment.status = 'captured';
  expect((await webhook(raw, signed)).status).toBe(200);
  expect(fulfilled).toBe(true);
  fulfilled = false;
  const unrelated = JSON.stringify({ event: 'payment.authorized' });
  expect((await webhook(unrelated, sign(webhookSecret, unrelated))).status).toBe(200);
  expect(fulfilled).toBe(false);
});

test('public prices disable paid checkout if webhook setup is missing', async () => {
  delete env.RAZORPAY_WEBHOOK_SECRET;
  const response = await invoke({ action: 'prices' }, 'anonymous');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.plans.find((plan: any) => plan.id === 'free').enabled).toBe(true);
  expect(body.plans.find((plan: any) => plan.id === 'yearly').enabled).toBe(false);
});
