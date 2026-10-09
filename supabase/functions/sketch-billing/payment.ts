export async function validSignature(secret: string, message: string, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new Uint8Array(signature.match(/../g)!.map((part) => parseInt(part, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(message));
}

export interface Order {
  order_id: string;
  user_id: string;
  plan: 'yearly' | 'lifetime';
  amount: number;
  currency: string;
}

export function isCapturedPayment(payment: Record<string, unknown>, order: Order, paymentId: string): boolean {
  return payment.id === paymentId && payment.order_id === order.order_id
    && payment.status === 'captured' && payment.amount === order.amount && payment.currency === order.currency;
}
