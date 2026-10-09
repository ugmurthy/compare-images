import { supabase } from './supabase';

export type PlanId = 'free' | 'yearly' | 'lifetime';
export interface Price { id: PlanId; amount: number | null; currency: string; enabled: boolean }
export interface Membership {
  user_id: string;
  plan: PlanId;
  selected_plan: PlanId;
  expires_at: string | null;
  activated_at: string;
  referral_code: string;
  referrals_used: number;
  referral_result: 'rewarded' | 'unavailable' | null;
}
export const planNames: Record<PlanId, string> = { free: 'Free', yearly: 'Yearly', lifetime: 'Lifetime' };
const intentKey = 'sketch-signup-intent';

export function signupIntent(): { plan: PlanId; referral: string | null } {
  let stored: { plan?: string; referral?: string } = {};
  try { stored = JSON.parse(sessionStorage.getItem(intentKey) ?? '{}'); } catch { /* Storage is optional. */ }
  const referral = new URL(window.location.href).searchParams.get('ref') ?? stored?.referral;
  return {
    plan: stored && ['free', 'yearly', 'lifetime'].includes(stored.plan ?? '') ? stored.plan as PlanId : 'free',
    referral: typeof referral === 'string' && /^[a-f0-9-]{36}$/i.test(referral) ? referral.toLowerCase() : null
  };
}

export function rememberSignup(plan: PlanId, referral: string | null) {
  try { sessionStorage.setItem(intentKey, JSON.stringify({ plan, referral })); } catch { /* Email signup also stores intent on the server. */ }
}

export async function activateMembership(): Promise<Membership> {
  if (!supabase) throw new Error('Authentication not configured');
  const intent = signupIntent();
  const { data, error } = await supabase.rpc('sketch_activate', { p_plan: intent.plan, p_referral: intent.referral });
  if (error || !data) throw new Error('Membership unavailable');
  try { sessionStorage.removeItem(intentKey); } catch { /* Storage is optional. */ }
  return data;
}

export async function billing<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Authentication not configured');
  const { data, error } = await supabase.functions.invoke('sketch-billing', { body });
  if (error || data?.error) throw new Error('Billing unavailable');
  return data as T;
}

interface CheckoutResult { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface CheckoutOptions {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  prefill: { email: string }; handler: (result: CheckoutResult) => void; modal: { ondismiss: () => void };
}
interface Checkout { open: () => void; on: (event: 'payment.failed', handler: () => void) => void }
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => Checkout } }
let checkoutScript: Promise<void> | null = null;

async function loadCheckout() {
  if (window.Razorpay) return;
  if (!checkoutScript) {
    checkoutScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => window.Razorpay ? resolve() : reject(new Error('Checkout unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Checkout unavailable')); };
      document.head.append(script);
    }).catch((error) => { checkoutScript = null; throw error; });
  }
  await checkoutScript;
}

// A dismissal is not a payment. Only a verified captured payment changes access.
export async function purchasePlan(plan: 'yearly' | 'lifetime', email: string): Promise<boolean> {
  await loadCheckout();
  const order = await billing<{ key: string; order_id: string; amount: number; currency: string }>({ action: 'create-order', plan });
  return new Promise<boolean>((resolve, reject) => {
    let verifying = false;
    const checkout = new window.Razorpay!({
      ...order, name: 'Compare Sketch', description: `${planNames[plan]} · all features`, prefill: { email },
      handler: (result) => {
        verifying = true;
        void billing({ action: 'verify-payment', order_id: order.order_id,
          payment_id: result.razorpay_payment_id, signature: result.razorpay_signature })
          .then(() => resolve(true), reject);
      },
      modal: { ondismiss: () => { if (!verifying) resolve(false); } }
    });
    // Razorpay lets customers retry failures in the same modal. Keep it open.
    checkout.on('payment.failed', () => { /* Access stays unchanged; dismissal resolves the attempt. */ });
    checkout.open();
  });
}
