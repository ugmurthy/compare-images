import { afterAll, beforeEach, expect, test } from 'bun:test';
import { plugin } from 'bun';

// Exercise the real Edge handler with disposable Auth/database/mail HTTP peers.
const userId = '00000000-0000-4000-8000-000000000001';
const code = '10000000-0000-4000-8000-000000000001';
let handler: (request: Request) => Promise<Response>;
let confirmed = true;
let limited = false;
let providerFails = false;
let mail: Record<string, any> | null = null;
const mock = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  if (new URL(request.url).pathname === '/auth/v1/user') {
    return request.headers.get('Authorization') === 'Bearer verified-test-user'
      ? Response.json({ id: userId, email_confirmed_at: confirmed ? '2026-01-01' : null })
      : Response.json({ message: 'Invalid token' }, { status: 401 });
  }
  if (new URL(request.url).pathname === '/rest/v1/rpc/sketch_reserve_invite') {
    expect(await request.json()).toEqual({ p_user_id: userId });
    return limited ? Response.json({ message: 'Invite limit reached' }, { status: 400 }) : Response.json(code);
  }
  return new Response(null, { status: 404 });
} });
const env: Record<string, string> = { SUPABASE_URL: mock.url.origin, SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role',
  RESEND_API_KEY: 'test-only-mail-key', SKETCH_INVITE_FROM: 'SketchLens <invites@example.test>', SKETCH_APP_URL: 'https://sketch.example.test' };
const previousDeno = (globalThis as any).Deno;
(globalThis as any).Deno = { env: { get: (name: string) => env[name] }, serve: (next: typeof handler) => { handler = next; } };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://api.resend.com/emails') {
    mail = JSON.parse(init!.body as string);
    return providerFails ? Response.json({ message: 'Private mail detail' }, { status: 500 }) : Response.json({ id: 'email-fixture' });
  }
  if (!url.startsWith(mock.url.origin)) throw new Error('Unexpected external request');
  return realFetch(input, init);
}) as typeof fetch;
plugin({ name: 'referral-deno-import', setup(build) {
  build.onResolve({ filter: /^@supabase\/supabase-js@/, namespace: 'npm' }, () => ({
    path: new URL(import.meta.resolve('@supabase/supabase-js')).pathname, namespace: 'file'
  }));
} });
await import('../supabase/functions/sketch-referral/index.ts');
afterAll(async () => { globalThis.fetch = realFetch; (globalThis as any).Deno = previousDeno; await mock.stop(true); });
beforeEach(() => { confirmed = true; limited = false; providerFails = false; mail = null; env.RESEND_API_KEY = 'test-only-mail-key'; });
const invoke = (body: unknown, token = 'verified-test-user') => handler(new Request('https://example.test/sketch-referral', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}));

test('email invitation uses verified member and canonical landing URL, never browser-supplied content', async () => {
  const response = await invoke({ email: ' friend@example.test ', user_id: 'attacker', referral_code: 'forged', url: 'https://evil.test', text: 'spam' });
  expect(await response.json()).toEqual({ sent: true });
  expect(mail!.to).toEqual(['friend@example.test']);
  expect(mail!.from).toBe(env.SKETCH_INVITE_FROM);
  expect(mail!.text).toContain(`https://sketch.example.test/?ref=${code}`);
  expect(mail!.text).not.toMatch(/attacker|forged|evil|spam/);
});

test('unverified callers, multiple recipients, and rate-limited accounts cannot send', async () => {
  expect((await invoke({ email: 'friend@example.test' }, 'invalid')).status).toBe(401);
  confirmed = false;
  expect((await invoke({ email: 'friend@example.test' })).status).toBe(401);
  confirmed = true;
  for (const email of ['', 'one@example.test,two@example.test', 'friend@example.test\r\nBcc: victim@example.test']) {
    expect((await invoke({ email })).status).toBe(400);
  }
  limited = true;
  expect((await invoke({ email: 'friend@example.test' })).status).toBe(429);
  expect(mail).toBeNull();
});

test('missing configuration and rejected mail never report success or leak provider details', async () => {
  delete env.RESEND_API_KEY;
  expect((await invoke({ email: 'friend@example.test' })).status).toBe(503);
  expect(mail).toBeNull();
  env.RESEND_API_KEY = 'test-only-mail-key';
  providerFails = true;
  const response = await invoke({ email: 'friend@example.test' });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('Private mail detail');
});
