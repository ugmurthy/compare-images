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
let googleCode = 0;
let membershipFails = false;
let pricesEnabled = true;
let verificationFails = false;
const member = {
  user_id: '00000000-0000-4000-8000-000000000001', plan: 'free', selected_plan: 'free',
  expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), activated_at: new Date().toISOString(),
  referral_code: '10000000-0000-4000-8000-000000000001', referrals_used: 0, referral_result: null
};
const profilePhoto = 'http://127.0.0.1:54325/profile-avatar.svg';
const usedCodes = new Set<string>();
const user = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'artist@example.test', email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} as Record<string, unknown>
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
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, content-profile, accept-profile',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/profile-avatar.svg') {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#c6ded5"/><ellipse cx="40" cy="78" rx="30" ry="27" fill="#35665b"/><ellipse cx="40" cy="34" rx="19" ry="23" fill="#bd815b"/><path d="M21 33V25a19 19 0 0 1 38 0v9L49 20l-28 13" fill="#43332b"/></svg>', {
        headers: { ...headers, 'Content-Type': 'image/svg+xml' }
      });
    }
    const payload = await request.text();
    const body = payload ? JSON.parse(payload) : {};
    records.push({ path: url.pathname, query: url.searchParams, body });
    const json = (data: unknown, status = 200) => Response.json(data, { headers, status });
    const failure = () => json({ code: 'mock_failure', msg: 'Private provider detail must not appear in the UI' }, 400);
    if (url.pathname === '/rest/v1/rpc/sketch_activate') {
      return membershipFails ? failure() : json(member);
    }
    if (url.pathname === '/functions/v1/sketch-billing') {
      if (body.action === 'prices') return json({ plans: [
        { id: 'free', amount: null, currency: 'INR', enabled: true },
        { id: 'yearly', amount: pricesEnabled ? 120000 : null, currency: 'INR', enabled: pricesEnabled },
        { id: 'lifetime', amount: pricesEnabled ? 350000 : null, currency: 'INR', enabled: pricesEnabled }
      ] });
      if (body.action === 'create-order') return json({ order_id: `order_${body.plan}`, key: 'rzp_test_browser_only', amount: body.plan === 'yearly' ? 120000 : 350000, currency: 'INR' });
      if (body.action === 'verify-payment') {
        if (verificationFails) return failure();
        member.plan = body.order_id === 'order_yearly' ? 'yearly' : 'lifetime';
        member.selected_plan = member.plan;
        member.expires_at = member.plan === 'lifetime' ? '' : '2030-12-15T12:00:00Z';
        return json({ verified: true });
      }
    }
    if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/recover') {
      challenge = body.code_challenge;
      return json(url.pathname.endsWith('signup') ? user : {});
    }
    if (url.pathname === '/auth/v1/authorize') {
      challenge = url.searchParams.get('code_challenge') ?? '';
      // Simulate provider consent without contacting Google or a real Supabase.
      const redirect = new URL(url.searchParams.get('redirect_to')!);
      redirect.searchParams.set('code', `google-code-${++googleCode}`);
      return new Response(null, { status: 302, headers: { ...headers, Location: redirect.href } });
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        return body.email === user.email && body.password === currentPassword ? json(tokenResponse()) : failure();
      }
      if (url.searchParams.get('grant_type') === 'pkce') {
        const hashed = new Bun.CryptoHasher('sha256').update(body.code_verifier ?? '').digest('base64url');
        if (!challenge || hashed !== challenge || !['confirmation-code', 'recovery-code', 'empty-code', `google-code-${googleCode}`].includes(body.auth_code) || usedCodes.has(body.auth_code)) return failure();
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
const waitForApp = () => browser('wait', '.account-avatar');
async function expectDOM(expression: string, message: string) {
  check(await browser('eval', expression) === 'true', message);
}
async function capture(state: string) {
  for (const [width, height, name] of [[1280, 900, 'desktop'], [390, 844, 'narrow']] as const) {
    await browser('set', 'viewport', `${width}`, `${height}`, '2');
    await browser('eval', 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await expectDOM('document.documentElement.scrollWidth <= innerWidth', `${state}: no horizontal overflow at ${width}px`);
    await expectDOM('(() => { if (!document.querySelector(".app-bar")) return true; const nav = document.querySelector(".primary-nav").getBoundingClientRect(); const tools = document.querySelector(".app-status").getBoundingClientRect(); const brand = document.querySelector(".brand").getBoundingClientRect(); return nav.right <= tools.left && (!brand.width || brand.right <= nav.left); })()', `${state}: header groups do not overlap at ${width}px`);
    if (artifacts) await browser('screenshot', '--full', `${artifacts}/${state}-${name}.png`);
  }
}
async function login(password = currentPassword) {
  await browser('fill', '#auth-email', user.email);
  await browser('fill', '#auth-password', password);
  await click('Sign in');
}
async function signOut() {
  await click('Account menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Sign out', '--exact');
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
  check(last('signup').body.data.sketch_plan === 'free', 'Default signup requests the free plan, not paid access');
  check(last('signup').query.get('redirect_to') === `${origin}/auth/callback`, 'Signup callback uses exact current origin');
  check(last('signup').body.code_challenge_method === 's256' && !!challenge, 'Signup uses PKCE');
  await expectDOM('!document.querySelector(".app-bar") && document.querySelector("#auth-password").value === ""', 'Confirmation required; password cleared');
  await capture('registration-sent');
  await browser('open', `${origin}/auth/callback?code=confirmation-code&next=https://untrusted.example`);
  await waitForApp();
  check(await browser('get', 'url') === `${origin}/`, 'Callback strips code, never follows next redirect');
  check(records.filter((record) => record.body.auth_code === 'confirmation-code').length === 1, 'Code exchanged exactly once');
  await browser('reload');
  await waitForApp();
  await capture('workspace');
  await expectDOM('!document.querySelector(".account-avatar img") && document.querySelector(".account-avatar").textContent.trim() === "A"', 'Missing profile photo falls back to email initial');
  await expectDOM('document.querySelector(".account-avatar").closest(".account").previousElementSibling.matches(".runtime-pill") && !document.querySelector(".account-bar")', 'Avatar follows OpenCV status, separate account bar removed');
  await click('Account menu');
  await expectDOM('document.querySelector(".account-avatar").getAttribute("aria-expanded") === "true" && document.activeElement.getAttribute("role") === "menuitem" && document.querySelector(".account-menu").textContent.includes("artist@example.test")', 'Menu exposes identity and focuses sign-out');
  await capture('account-menu');
  await browser('press', 'Escape');
  await expectDOM('!document.querySelector(".account-menu") && document.activeElement.matches(".account-avatar")', 'Escape closes menu and restores avatar focus');
  await browser('press', 'ArrowDown');
  await expectDOM('document.querySelector(".account-menu") !== null && document.activeElement.getAttribute("role") === "menuitem"', 'Arrow key opens menu');
  await browser('press', 'Tab');
  await expectDOM('!document.querySelector(".account-menu")', 'Tab leaves and closes menu');
  await click('Account menu');
  await browser('click', '.hero p:last-child');
  await expectDOM('!document.querySelector(".account-menu")', 'Outside click closes menu');
  await browser('set', 'viewport', '320', '844', '2');
  await expectDOM('document.documentElement.scrollWidth <= innerWidth', 'Avatar fits compact 320px header');
  await browser('set', 'viewport', '390', '844', '2');
  await browser('select', 'select[aria-label="Color theme"]', 'dark');
  await capture('workspace-dark');
  await click('Account menu');
  await capture('account-menu-dark');
  await browser('press', 'Escape');
  await browser('select', 'select[aria-label="Color theme"]', 'light');
  await browser('click', '.primary-nav button:nth-child(3)');
  await waitText('Projects, comparisons, and saved parts');
  await browser('click', '.primary-nav button:first-child');
  await expectDOM('document.querySelector(".app-bar") !== null && document.querySelectorAll(".drop-zone").length === 2', 'Original app navigation and upload controls remain');
  signOutFails = true;
  await signOut();
  await waitText('session revocation could not be confirmed');
  await expectDOM('!document.querySelector(".app-bar")', 'Remote sign-out failure still clears local session and unmounts the workspace');
  await capture('signout-warning');
  signOutFails = false;
  await browser('reload');
  await waitText('Welcome back');
  await login();
  await waitForApp();
  await signOut();
  await waitText('Welcome back');
  await expectDOM('!document.querySelector(".app-bar")', 'Sign-out unmounts protected app');
  await browser('reload');
  await waitText('Welcome back');
  await login();
  await waitForApp();
  await signOut();
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
  await signOut();
  await waitText('Welcome back');
  await login('initial-test-password');
  await waitText('Unable to sign in.');
  await login('updated-test-password');
  await waitForApp();

  // An existing session must not conceal a failed/expired callback.
  await browser('open', `${origin}/auth/callback?code=expired-code`);
  await waitText('We couldn’t use this link');
  await expectDOM('!document.querySelector(".app-bar")', 'Failed callback blocks the app even with a saved session');
  await browser('open', origin);
  await waitForApp();
  await signOut();
  await waitText('Welcome back');
  user.app_metadata.provider = 'google';
  user.user_metadata = { avatar_url: profilePhoto, picture: 'http://127.0.0.1:54325/missing-photo' };
  await click('Continue with Google');
  await waitForApp();
  check(last('authorize').query.get('provider') === 'google' && last('authorize').query.get('redirect_to') === `${origin}/auth/callback`, 'Google provider and redirect exact');
  check(last('authorize').query.get('code_challenge_method') === 's256', 'Google uses PKCE');
  await browser('wait', '--fn', 'document.querySelector(".account-avatar img")?.naturalWidth > 0');
  await expectDOM(`document.querySelector(".account-avatar img").src === ${JSON.stringify(profilePhoto)}`, 'Google avatar_url takes precedence over picture');
  await capture('google-avatar');
  await browser('reload');
  await waitForApp();
  await browser('wait', '--fn', 'document.querySelector(".account-avatar img")?.naturalWidth > 0');
  await click('Account menu');
  await expectDOM('document.activeElement.getAttribute("role") === "menuitem" && document.querySelector(".account-menu").textContent.includes("artist@example.test")', 'Restored Google photo preserves accessible account menu');
  await capture('google-account-menu');
  await browser('press', 'Escape');
  await expectDOM('document.activeElement.matches(".account-avatar")', 'Google avatar retains keyboard focus on menu dismissal');
  await signOut();
  await waitText('Welcome back');
  user.user_metadata = { avatar_url: ' ', picture: profilePhoto };
  await click('Continue with Google');
  await waitForApp();
  await browser('wait', '--fn', 'document.querySelector(".account-avatar img")?.naturalWidth > 0');
  await expectDOM(`document.querySelector(".account-avatar img").src === ${JSON.stringify(profilePhoto)}`, 'Google picture is used when avatar_url is empty');
  await signOut();
  await waitText('Welcome back');
  user.user_metadata = { avatar_url: 'http://127.0.0.1:54325/missing-photo' };
  await click('Continue with Google');
  await waitForApp();
  await browser('wait', '--fn', '!document.querySelector(".account-avatar img") && document.querySelector(".account-avatar").textContent.trim() === "A"');
  await capture('google-avatar-fallback');
  await signOut();
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
  emptyExchange = false;

  // Membership flows use real frontend requests, but mock Supabase and Checkout.
  // Amounts here are fixtures, never the production price catalog.
  await browser('open', `${origin}/pricing`);
  await waitText('Choose Yearly');
  await capture('public-prices');
  await click('Choose Yearly');
  await expectDOM('document.querySelector("#signup-plan").value === "yearly"', 'Pricing choice preselects signup plan');
  await browser('select', '#signup-plan', 'lifetime');
  await browser('fill', '#auth-email', 'new-artist@example.test');
  await browser('fill', '#auth-password', 'new-artist-password');
  await browser('fill', '#auth-confirmation', 'new-artist-password');
  await click('Create account');
  await waitText('Check your email');
  check(last('signup').body.data.sketch_plan === 'lifetime', 'Chosen paid plan is signup intent');
  check(member.plan === 'free', 'Selecting lifetime must not grant lifetime access');

  const referrerCode = '10000000-0000-4000-8000-000000000002';
  await browser('open', `${origin}/?ref=${referrerCode}`);
  await waitText('You’re signing up through a referral link');
  await capture('referral-registration');
  await click('Prices & subscriptions');
  await waitText('Choose Free');
  await click('Choose Free');
  await browser('fill', '#auth-email', 'referred-artist@example.test');
  await browser('fill', '#auth-password', 'referred-artist-password');
  await browser('fill', '#auth-confirmation', 'referred-artist-password');
  await click('Create account');
  await waitText('Check your email');
  check(last('signup').body.data.sketch_referral === referrerCode, 'Referral survives navigation to pricing and signup');
  await click('Back to sign in');
  membershipFails = true;
  await login();
  await waitText('Subscription unavailable');
  await expectDOM('!document.querySelector(".app-bar")', 'Missing billing backend fails closed, never unlocks the workspace');
  await capture('membership-error');
  membershipFails = false;
  await click('Retry');
  await waitForApp();
  await browser('eval', `(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext('2d'); context.fillStyle = '#f5f1e9'; context.fillRect(0, 0, 320, 240);
    context.strokeStyle = '#303030'; context.strokeRect(50, 40, 180, 140);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const input = document.querySelector('[aria-label="Reference upload"] input');
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'retained-reference.png', { type: 'image/png' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await browser('wait', 'img[alt="Reference preview"]');
  const referenceUrl = JSON.parse(await browser('eval', `document.querySelector('img[alt="Reference preview"]').src`));
  await click('Account menu');
  await browser('press', 'ArrowUp');
  await expectDOM('document.activeElement.textContent.trim() === "Subscription & referrals"', 'Arrow keys reach the new menu item');
  await browser('press', 'Enter');
  await waitText('0 of 2 referrals rewarded');
  await expectDOM('document.querySelector("#referral-link").value.endsWith("?ref=" + "10000000-0000-4000-8000-000000000001") && !document.querySelector(".app-bar")', 'Personal referral link; workspace controls are suspended');
  await capture('subscription-active');
  await browser('select', 'select[aria-label="Color theme"]', 'dark');
  await capture('subscription-dark');
  await browser('select', 'select[aria-label="Color theme"]', 'light');

  async function mockCheckout(result: 'cancel' | 'success') {
    await browser('eval', `window.Razorpay = class { constructor(options) { this.options = options; } on() {} open() { ${result === 'cancel' ? 'this.options.modal.ondismiss();' : 'this.options.handler({ razorpay_payment_id: "pay_browser", razorpay_order_id: this.options.order_id, razorpay_signature: "test-signature" });'} } }; true`);
  }
  await mockCheckout('cancel');
  await click('Get Yearly');
  await waitText('Checkout closed.');
  check(member.plan === 'free', 'Checkout cancellation preserves trial');
  verificationFails = true;
  await mockCheckout('success');
  await click('Get Yearly');
  await waitText('Payment could not be confirmed.');
  check(member.plan === 'free', 'Unverified payment does not grant paid access');
  await capture('payment-error');
  verificationFails = false;
  await click('Get Yearly');
  await waitText('Payment verified.');
  await waitText('Yearly access');
  check(member.plan === 'yearly', 'Verified payment refreshes subscription');
  await click('Back to app');
  await waitForApp();
  await expectDOM(`document.querySelector('img[alt="Reference preview"]').src === ${JSON.stringify(referenceUrl)} && document.body.textContent.includes('retained-reference.png')`, 'Subscription navigation preserves the selected reference and its object URL');
  member.expires_at = '2020-01-01T00:00:00Z';
  await browser('reload');
  await waitText('Expired');
  await expectDOM('!document.querySelector(".app-bar") && !!document.querySelector("#referral-link")', 'Expired access unmounts workspace but keeps renewal/referral access');
  await capture('subscription-expired');
  member.referrals_used = 2;
  await click('Refresh access');
  await waitText('2 of 2 referrals rewarded');
  await expectDOM('!document.querySelector("#referral-link")', 'Exhausted referrals hide link creation');
  await capture('referrals-exhausted');
  pricesEnabled = false;
  await browser('reload');
  await waitText('Price coming soon');
  await expectDOM('Array.from(document.querySelectorAll(".plans button")).every(b => b.disabled)', 'Unconfigured paid plans cannot open checkout');
  await capture('prices-unconfigured');
  pricesEnabled = true;
  member.plan = 'lifetime';
  member.selected_plan = 'lifetime';
  member.expires_at = '';
  await browser('open', `${origin}/pricing`);
  await waitText('Yours for life.');
  await expectDOM('document.querySelector(".membership").textContent.includes("Active") && Array.from(document.querySelectorAll(".plans button")).every(b => b.disabled)', 'Lifetime requires no expiry and cannot be repurchased');
  await capture('subscription-lifetime');
  await click('Sign out');
  await waitText('Welcome back');
  console.log('PASS: auth gate; accessible forms; general errors; registration + PKCE confirmation; email login; persistence; account avatar placement/menu/keyboard/dismissal; light + dark layouts; sign-out success/failure; reset request/recovery/update/failure; Google PKCE + profile avatar/picture/persistence/error fallback; invalid/missing/denied/no-session callbacks; safe redirects; desktop + narrow overflow checks.');
  console.log('PASS: public prices; paid signup selection without entitlement; referral signup/navigation; membership failure/retry; subscription menu keyboard access; comparison preservation; cancelled/unverified/verified checkout; expired and lifetime access; exhausted referrals; unconfigured prices; desktop + narrow subscription layouts. Payment and identity providers are mocks, not live gateway verification.');
} catch (error) {
  console.error(await browser('snapshot'));
  console.error(await browser('errors'));
  console.error(await browser('console'));
  throw error;
} finally {
  await browser('close');
  await mock.stop(true);
}
