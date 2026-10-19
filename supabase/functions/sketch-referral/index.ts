import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: 'Sign-in required' }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user?.email_confirmed_at) return json({ error: 'Confirmed sign-in required' }, 401);
    const input = await request.json();
    const email = typeof input?.email === 'string' ? input.email.trim() : '';
    if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
      return json({ error: 'Enter one valid email address' }, 400);
    }
    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('SKETCH_INVITE_FROM');
    const appUrl = new URL(Deno.env.get('SKETCH_APP_URL') ?? '');
    if (!key || !from || appUrl.protocol !== 'https:' || appUrl.username || appUrl.password) {
      return json({ error: 'Email invitations are not configured' }, 503);
    }
    const { data: code, error } = await admin.rpc('sketch_reserve_invite', { p_user_id: user.id });
    if (error) return json({ error: 'Unable to invite right now. Try later or copy your link.' }, error.message === 'Invite limit reached' ? 429 : 409);
    // Never accept a browser-supplied referrer, URL, sender, or email content.
    const link = new URL('/', appUrl.origin);
    link.searchParams.set('ref', code);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'An invitation to SketchLens',
        text: `You’ve been invited to try SketchLens.\n\nAlign your reference with a photo of your sketch, compare details, and measure proportions. New accounts can try every feature free for 3 months.\n\nCreate your account: ${link.href}\n\nYour friend may earn a referral extension when you confirm your email and open the app. No action is needed if you weren’t expecting this invitation.` }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok || !(await response.json()).id) throw new Error('Email not accepted');
    return json({ sent: true });
  } catch {
    // A timeout may follow acceptance. Do not automatically resend.
    return json({ error: 'Email delivery could not be confirmed. Copy your link instead.' }, 503);
  }
});
