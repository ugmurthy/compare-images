import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run against disposable Vite with the test-only env documented in README.
// This uses the actual Supabase client, not stubbed component auth methods.
const origin = new URL(Bun.argv[2] ?? 'http://localhost:5174').origin;
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
  throw new Error('Use a disposable local Vite server, never a production app.');
}
const artifacts = Bun.env.AUTH_SCREENSHOTS ? resolve(Bun.env.AUTH_SCREENSHOTS) : null;
const records: { path: string; query: URLSearchParams; body: Record<string, any> }[] = [];
let currentPassword = 'initial-test-password';
let signOutFails = false;
let updateFails = false;
let emptyExchange = false;
let challenge = '';
const usedCodes = new Set<string>();
const user = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'artist@example.test', email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}
};
function tokenResponse() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp, role: 'authenticated' })}.test-signature`,
    refresh_token: 'test-only-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: exp, user
  };
}
const mock = Bun.serve({
  hostname: '127.0.0.1', port: 54325,
  async fetch(request) {
    const url = new URL(request.url);
    const headers = { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const payload = await request.text();
    const body = payload ? JSON.parse(payload) : {};
    records.push({ path: url.pathname, query: url.searchParams, body });
    const json = (data: unknown, status = 200) => Response.json(data, { headers, status });
    const failure = () => json({ code: 'mock_failure', msg: 'Private provider detail must not appear in the UI' }, 400);
    if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/recover') {
      challenge = body.code_challenge;
      return json(url.pathname.endsWith('signup') ? user : {});
    }
    if (url.pathname === '/auth/v1/authorize') {
      challenge = url.searchParams.get('code_challenge') ?? '';
      // Simulate provider consent without contacting Google or a real Supabase.
      const redirect = new URL(url.searchParams.get('redirect_to')!);
      redirect.searchParams.set('code', 'google-code');
      return new Response(null, { status: 302, headers: { ...headers, Location: redirect.href } });
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        return body.email === user.email && body.password === currentPassword ? json(tokenResponse()) : failure();
      }
      if (url.searchParams.get('grant_type') === 'pkce') {
        const hashed = new Bun.CryptoHasher('sha256').update(body.code_verifier ?? '').digest('base64url');
        if (!challenge || hashed !== challenge || !['confirmation-code', 'recovery-code', 'google-code', 'empty-code'].includes(body.auth_code) || usedCodes.has(body.auth_code)) return failure();
        usedCodes.add(body.auth_code);
        if (emptyExchange) return json({ user });
        return json(tokenResponse());
      }
      return json(tokenResponse());
    }
    if (url.pathname === '/auth/v1/user') {
      if (request.method === 'PUT') {
        if (updateFails) return failure();
        currentPassword = body.password;
      }
      return json(user);
    }
    if (url.pathname === '/auth/v1/logout') {
      return signOutFails ? json({ code: 'unexpected_failure', msg: 'private detail' }, 500) : new Response(null, { status: 204, headers });
    }
    return json({ message: 'Unexpected mock route' }, 404);
  }
});

async function browser(...args: string[]): Promise<string> {
  const process = Bun.spawn(['agent-browser', '--session', 'supabase-check', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (exitCode) throw new Error(`agent-browser ${args[0]} failed: ${stderr || stdout}`);
  return stdout.trim();
}
function check(value: boolean, message: string) {
  if (!value) throw new Error(message);
}
const click = (text: string) => browser('find', 'role', 'button', 'click', '--name', text, '--exact');
const waitText = (text: string) => browser('wait', '--fn', `document.body.textContent.includes(${JSON.stringify(text)})`);
async function expectDOM(expression: string, message: string) {
  check(await browser('eval', expression) === 'true', message);
}
async function capture(state: string) {
  for (const [width, height, name] of [[1280, 900, 'desktop'], [390, 844, 'narrow']] as const) {
    await browser('set', 'viewport', `${width}`, `${height}`, '2');
    await browser('eval', 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await expectDOM('document.documentElement.scrollWidth <= innerWidth', `${state}: no horizontal overflow at ${width}px`);
    if (artifacts) await browser('screenshot', '--full', `${artifacts}/${state}-${name}.png`);
  }
}
async function login(password = currentPassword) {
  await browser('fill', '#auth-email', user.email);
  await browser('fill', '#auth-password', password);
  await click('Sign in');
}
function last(path: string) {
  const record = records.findLast((entry) => entry.path === `/auth/v1/${path}`);
  if (!record) throw new Error(`Missing ${path} request`);
  return record;
}

try {
  if (artifacts) await mkdir(artifacts, { recursive: true });
  await browser('open', origin);
  await browser('eval', 'localStorage.clear()');
  await browser('reload');
  await waitText('Welcome back');
  await expectDOM('!document.querySelector(".app-bar") && !document.querySelector(".drop-zone")', 'App must not mount before authentication');
  await expectDOM('document.querySelector("#auth-email").labels[0].textContent === "Email" && document.querySelector("#auth-password").autocomplete === "current-password"', 'Accessible email/password inputs');
  await capture('login');
  await login('wrong-password');
  await waitText('Unable to sign in.');
  await expectDOM('!document.body.textContent.includes("Private provider detail") && !document.querySelector(".app-bar")', 'General login error, still gated');
  await capture('login-error');

  await click('Create an account');
  await capture('registration');
  await browser('fill', '#auth-password', 'registration-password');
  await browser('fill', '#auth-confirmation', 'different-password');
  await click('Create account');
  await waitText('The passwords do not match.');
  check(!records.some((record) => record.path.endsWith('/signup')), 'Mismatch must not send signup');
  await browser('fill', '#auth-confirmation', 'registration-password');
  await click('Create account');
  await waitText('Check your email');
  check(last('signup').query.get('redirect_to') === `${origin}/auth/callback`, 'Signup callback uses exact current origin');
  check(last('signup').body.code_challenge_method === 's256' && !!challenge, 'Signup uses PKCE');
  await expectDOM('!document.querySelector(".app-bar") && document.querySelector("#auth-password").value === ""', 'Confirmation required; password cleared');
  await capture('registration-sent');
  await browser('open', `${origin}/auth/callback?code=confirmation-code&next=https://untrusted.example`);
  await waitText('Signed in as');
  check(await browser('get', 'url') === `${origin}/`, 'Callback strips code, never follows next redirect');
  check(records.filter((record) => record.body.auth_code === 'confirmation-code').length === 1, 'Code exchanged exactly once');
  await browser('reload');
  await waitText('Signed in as');
  await capture('workspace');
  await browser('click', '.primary-nav button:nth-child(3)');
  await waitText('Projects, comparisons, and saved parts');
  await browser('click', '.primary-nav button:first-child');
  await expectDOM('document.querySelector(".app-bar") !== null && document.querySelectorAll(".drop-zone").length === 2', 'Original app navigation and upload controls remain');
  signOutFails = true;
  await click('Sign out');
  await waitText('session revocation could not be confirmed');
  await expectDOM('!document.querySelector(".app-bar")', 'Remote sign-out failure still clears local session and unmounts the workspace');
  await capture('signout-warning');
  signOutFails = false;
  await browser('reload');
  await waitText('Welcome back');
  await login();
  await waitText('Signed in as');
  await click('Sign out');
  await waitText('Welcome back');
  await expectDOM('!document.querySelector(".app-bar")', 'Sign-out unmounts protected app');
  await browser('reload');
  await waitText('Welcome back');
  await login();
  await waitText('Signed in as');
  await click('Sign out');
  await waitText('Welcome back');

  await click('Forgot password?');
  await capture('forgot-password');
  await browser('fill', '#auth-email', user.email);
  await click('Send reset link');
  await waitText('If an account exists');
  check(last('recover').query.get('redirect_to') === `${origin}/auth/reset-password`, 'Reset callback is allowlisted path on current origin');
  await capture('reset-sent');
  await browser('open', `${origin}/auth/reset-password?code=recovery-code`);
  await waitText('Choose a new password');
  await expectDOM('!document.querySelector(".app-bar")', 'Recovery session cannot skip the password form');
  check(await browser('get', 'url') === `${origin}/auth/reset-password`, 'Reset code removed');
  await browser('reload');
  await waitText('Choose a new password');
  await capture('new-password');
  await browser('fill', '#auth-password', 'updated-test-password');
  await browser('fill', '#auth-confirmation', 'updated-test-password');
  updateFails = true;
  await click('Update password');
  await waitText('Unable to update your password');
  await expectDOM('!document.querySelector(".app-bar")', 'Failed password update stays on recovery form');
  updateFails = false;
  await click('Update password');
  await waitText('Your password has been updated.');
  check(last('user').body.password === 'updated-test-password', 'Password update sent independently chosen new password');
  await click('Sign out');
  await waitText('Welcome back');
  await login('initial-test-password');
  await waitText('Unable to sign in.');
  await login('updated-test-password');
  await waitText('Signed in as');

  // An existing session must not conceal a failed/expired callback.
  await browser('open', `${origin}/auth/callback?code=expired-code`);
  await waitText('We couldn’t use this link');
  await expectDOM('!document.querySelector(".app-bar")', 'Failed callback blocks the app even with a saved session');
  await browser('open', origin);
  await waitText('Signed in as');
  await click('Sign out');
  await waitText('Welcome back');
  await click('Continue with Google');
  await waitText('Signed in as');
  check(last('authorize').query.get('provider') === 'google' && last('authorize').query.get('redirect_to') === `${origin}/auth/callback`, 'Google provider and redirect exact');
  check(last('authorize').query.get('code_challenge_method') === 's256', 'Google uses PKCE');
  await click('Sign out');
  await waitText('Welcome back');
  for (const path of ['/auth/callback', '/auth/reset-password', '/auth/callback?error=access_denied&error_description=Private-provider-detail', '/auth/reset-password?code=expired-code']) {
    await browser('open', origin + path);
    await waitText('We couldn’t use this link');
    await expectDOM('!document.querySelector(".app-bar") && !document.body.textContent.includes("Private-provider-detail")', 'Missing/denied/expired callback remains gated without provider details');
  }
  await capture('callback-error');
  await click('Request a new reset link');
  await browser('fill', '#auth-email', user.email);
  await click('Send reset link');
  await waitText('If an account exists');
  emptyExchange = true;
  await browser('open', `${origin}/auth/callback?code=empty-code`);
  await waitText('We couldn’t use this link');
  await expectDOM('!document.querySelector(".app-bar")', 'Successful HTTP response without session must not unlock the app');
  console.log('PASS: auth gate; accessible forms; general errors; registration + PKCE confirmation; email login; persistence; sign-out success/failure; reset request/recovery/update/failure; Google PKCE; invalid/missing/denied/no-session callbacks; safe redirects; desktop + narrow overflow checks.');
} finally {
  await browser('close');
  await mock.stop(true);
}
