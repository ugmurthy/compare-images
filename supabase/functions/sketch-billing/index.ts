import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { isCapturedPayment, validSignature, type Order } from './payment.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

function credentials() {
  const key = Deno.env.get('RAZORPAY_KEY_ID');
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!key || !secret) throw new Error('Payment setup incomplete');
  return { key, secret };
}

async function razorpay(path: string, body?: unknown): Promise<Record<string, any>> {
  const { key, secret } = credentials();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error('Payment provider unavailable');
  return response.json();
}

async function fulfil(order: Order, paymentId: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error('Invalid payment');
  const payment = await razorpay(`payments/${paymentId}`);
  if (!isCapturedPayment(payment, order, paymentId)) throw new Error('Payment not captured or mismatched');
  const { error } = await admin.rpc('sketch_fulfil_order', { p_order_id: order.order_id, p_payment_id: paymentId });
  if (error) throw error;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const raw = await request.text();
    // Webhook authentication is independent of browser/Supabase credentials.
    if (new URL(request.url).pathname.endsWith('/webhook')) {
      const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
      if (!secret) return json({ error: 'Webhook setup incomplete' }, 503);
      if (!await validSignature(secret, raw, request.headers.get('x-razorpay-signature') ?? '')) {
        return json({ error: 'Invalid signature' }, 400);
      }
      const event = JSON.parse(raw);
      if (event.event !== 'payment.captured') return json({ received: true });
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) return json({ error: 'Invalid event' }, 400);
      const { data: order, error } = await admin.from('sketch_orders').select('*').eq('order_id', payment.order_id).maybeSingle();
      if (error) throw error;
      // This Razorpay account may also serve other applications.
      if (!order) return json({ received: true });
      await fulfil(order, payment.id);
      return json({ received: true });
    }

    const input = JSON.parse(raw);
    if (input.action === 'prices') {
      const { data, error } = await admin.from('sketch_plans').select('id, amount, currency, enabled');
      if (error) throw error;
      const configured = !!Deno.env.get('RAZORPAY_KEY_ID') && !!Deno.env.get('RAZORPAY_KEY_SECRET') && !!Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
      return json({ plans: data.map((plan) => ({ ...plan, enabled: plan.enabled && (plan.id === 'free' || (configured && plan.amount > 0)) })) });
    }
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: 'Sign-in required' }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user || !user.email_confirmed_at) return json({ error: 'Confirmed sign-in required' }, 401);
    const { data: member, error: memberError } = await admin.from('sketch_memberships').select('*').eq('user_id', user.id).single();
    if (memberError || !member.activated_at) return json({ error: 'Activate membership first' }, 409);

    if (input.action === 'create-order') {
      if (!['yearly', 'lifetime'].includes(input.plan) || member.plan === 'lifetime') return json({ error: 'Invalid plan' }, 400);
      const { data: plan, error } = await admin.from('sketch_plans').select('*').eq('id', input.plan).single();
      if (error || !plan.enabled || !plan.amount || !Deno.env.get('RAZORPAY_WEBHOOK_SECRET')) return json({ error: 'This plan is not available yet' }, 409);
      const { key } = credentials();
      const created = await razorpay('orders', {
        amount: plan.amount, currency: plan.currency, receipt: crypto.randomUUID(), partial_payment: false
      });
      const { error: insertError } = await admin.from('sketch_orders').insert({
        order_id: created.id, user_id: user.id, plan: plan.id, amount: plan.amount, currency: plan.currency
      });
      if (insertError) throw insertError;
      return json({ order_id: created.id, key, amount: plan.amount, currency: plan.currency });
    }
    if (input.action === 'verify-payment') {
      if (typeof input.order_id !== 'string' || typeof input.payment_id !== 'string' || typeof input.signature !== 'string') {
        return json({ error: 'Invalid payment details' }, 400);
      }
      const { data: order, error } = await admin.from('sketch_orders').select('*')
        .eq('order_id', input.order_id).eq('user_id', user.id).single();
      if (error) return json({ error: 'Unknown order' }, 400);
      if (!await validSignature(credentials().secret, `${order.order_id}|${input.payment_id}`, input.signature)) {
        return json({ error: 'Invalid payment signature' }, 400);
      }
      await fulfil(order, input.payment_id);
      return json({ verified: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch {
    // Never return provider, database, or credential details to the caller.
    // Non-2xx webhook responses cause Razorpay to retry transient failures.
    return json({ error: 'Unable to complete this request. Please retry.' }, 503);
  }
});
