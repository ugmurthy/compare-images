<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import App from './App.svelte';
  import Icon from './components/Icon.svelte';
  import { authConfigurationError, supabase } from './lib/supabase';

  type Mode = 'login' | 'register' | 'forgot' | 'reset';
  const callbackUrl = new URL(window.location.href);
  let page = $state(callbackUrl.pathname);
  let mode = $state<Mode>(callbackUrl.pathname === '/auth/reset-password' ? 'reset' : 'login');
  let session = $state<Session | null>(null);
  let ready = $state(false);
  let busy = $state(false);
  let email = $state('');
  let password = $state('');
  let confirmation = $state('');
  let error = $state('');
  let notice = $state('');
  let callbackFailed = $state(false);
  const title = $derived(mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Welcome back');

  function replacePath(path: string) {
    window.history.replaceState(null, '', path);
    page = path;
  }

  function chooseMode(next: Mode) {
    mode = next;
    password = '';
    confirmation = '';
    error = '';
    notice = '';
    callbackFailed = false;
    replacePath('/');
  }

  onMount(() => {
    if (!supabase) return;
    const client = supabase;
    let disposed = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (disposed) return;
      session = nextSession;
      if (event === 'PASSWORD_RECOVERY') mode = 'reset';
      if (event === 'SIGNED_OUT') {
        password = '';
        confirmation = '';
      }
    });

    async function initialize() {
      const isCallback = page === '/auth/callback' || page === '/auth/reset-password';
      try {
        if (isCallback) {
          // Never display provider-supplied errors or follow a user-supplied redirect.
          const fragment = new URLSearchParams(callbackUrl.hash.slice(1));
          if (callbackUrl.searchParams.has('error') || fragment.has('error')) throw new Error('callback');
          const code = callbackUrl.searchParams.get('code');
          if (code) {
            const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } else if (page === '/auth/callback') {
            throw new Error('missing code');
          }
        }
        const { data, error: sessionError } = await client.auth.getSession();
        if (disposed) return;
        if (sessionError) throw sessionError;
        session = data.session;
        if (isCallback && !session) throw new Error('missing session');
        if (page === '/auth/callback' && mode !== 'reset') replacePath('/');
        else if (isCallback) replacePath('/auth/reset-password');
      } catch {
        if (disposed) return;
        if (isCallback) {
          callbackFailed = true;
          error = 'This sign-in or reset link is invalid or expired. Try again in the same browser where you requested it.';
          // Remove authorization codes and error parameters from the address bar.
          replacePath(callbackUrl.pathname);
        } else {
          session = null;
          error = 'Could not restore your session. Please sign in again.';
        }
      } finally {
        if (!disposed) ready = true;
      }
    }
    void initialize();
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    error = '';
    notice = '';
    if ((mode === 'register' || mode === 'reset') && password !== confirmation) {
      error = 'The passwords do not match.';
      return;
    }
    busy = true;
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        password = '';
      } else if (mode === 'register') {
        const { error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
        });
        if (authError) throw authError;
        password = '';
        confirmation = '';
        notice = 'Check your email for a confirmation link. If you already have an account, sign in instead.';
      } else if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/reset-password`
        });
        if (authError) throw authError;
        notice = 'If an account exists for that email, you will receive a password reset link.';
      } else {
        if (!session) throw new Error('missing session');
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        password = '';
        confirmation = '';
        mode = 'login';
        replacePath('/');
        notice = 'Your password has been updated.';
      }
    } catch {
      error = mode === 'login' ? 'Unable to sign in. Check your email and password, confirm your email, and try again.'
        : mode === 'register' ? 'Unable to register. Check your details and the password requirements, or try signing in.'
        : mode === 'forgot' ? 'Unable to request a reset link. Please try again later.'
        : 'Unable to update your password. Check the password requirements or request a new reset link.';
    } finally {
      busy = false;
    }
  }

  async function googleLogin() {
    if (!supabase || busy) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (authError) throw authError;
    } catch {
      error = 'Unable to start Google sign-in. Please try again later.';
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (!supabase || busy) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
      session = null;
      chooseMode('login');
    } catch {
      // Supabase can clear this browser's session even if remote revocation fails.
      if (!session) chooseMode('login');
      error = session ? 'Unable to sign out. Please try again.'
        : 'Signed out in this browser, but session revocation could not be confirmed. Other sessions may still be active.';
    } finally {
      busy = false;
    }
  }
</script>

{#if authConfigurationError || !ready || callbackFailed || !session || mode === 'reset'}
  <main class="auth-page">
    <section class="auth-card" aria-labelledby="auth-title">
      <div class="auth-brand"><Icon name="logo" size={24} /><span>Compare Sketch</span></div>
      {#if authConfigurationError}
        <h1 id="auth-title">Authentication needs configuration</h1>
        <p role="alert">{authConfigurationError}</p>
      {:else if !ready}
        <h1 id="auth-title">Signing you in…</h1>
        <p role="status">Checking your session securely.</p>
      {:else if callbackFailed}
        <h1 id="auth-title">We couldn’t use this link</h1>
        <p class="auth-error" role="alert">{error}</p>
        <button class="btn primary" onclick={() => chooseMode('login')}>Back to sign in</button>
        <button class="btn" onclick={() => chooseMode('forgot')}>Request a new reset link</button>
      {:else}
        <h1 id="auth-title">{title}</h1>
        <p>{mode === 'register' ? 'One account for the apps using our shared identity service.' : mode === 'forgot' ? 'We’ll email you a link to choose a new password.' : mode === 'reset' ? 'Use a strong, unique password for your account.' : 'Sign in to align, compare, and measure your sketches.'}</p>
        {#if mode === 'login' || mode === 'register'}
          <button class="btn google" onclick={googleLogin} disabled={busy}>Continue with Google</button>
          <div class="auth-divider">or with email</div>
        {/if}
        {#if mode === 'reset' && !session}
          <p class="auth-error" role="alert">Open a valid password reset link from your email first.</p>
          <button class="btn primary" onclick={() => chooseMode('forgot')}>Request a reset link</button>
        {:else}
          <form onsubmit={submit}>
            {#if mode !== 'reset'}
              <label for="auth-email">Email</label>
              <input id="auth-email" type="email" autocomplete="email" required bind:value={email} disabled={busy} />
            {/if}
            {#if mode !== 'forgot'}
              <label for="auth-password">{mode === 'reset' ? 'New password' : 'Password'}</label>
              <input id="auth-password" type="password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
                minlength={mode === 'login' ? undefined : 8} required bind:value={password} disabled={busy} aria-describedby={mode === 'login' ? undefined : 'password-hint'} />
              {#if mode !== 'login'}
                <small id="password-hint">At least 8 characters. Your identity service may require more.</small>
                <label for="auth-confirmation">Confirm password</label>
                <input id="auth-confirmation" type="password" autocomplete="new-password" required bind:value={confirmation} disabled={busy} />
              {/if}
            {/if}
            <button class="btn primary" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Sign in'}
            </button>
          </form>
        {/if}
        {#if error}<p class="auth-error" role="alert">{error}</p>{/if}
        {#if notice}<p class="auth-notice" role="status">{notice}</p>{/if}
        <div class="auth-links">
          {#if mode === 'login'}
            <button class="btn quiet" disabled={busy} onclick={() => chooseMode('forgot')}>Forgot password?</button>
            <button class="btn quiet" disabled={busy} onclick={() => chooseMode('register')}>Create an account</button>
          {:else}
            <button class="btn quiet" disabled={busy} onclick={() => chooseMode('login')}>{session ? 'Back to app' : 'Back to sign in'}</button>
          {/if}
        </div>
        <p class="local-note">Sketches and history stay in this browser. Signing in does not sync or separate saved data by account.</p>
      {/if}
    </section>
  </main>
{:else}
  <div class="account-bar">
    <span title={session.user.email}>Signed in as <strong>{session.user.email ?? 'your account'}</strong></span>
    <button class="btn quiet" onclick={signOut} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
  </div>
  {#if error}<p class="account-message auth-error" role="alert">{error}</p>{/if}
  {#if notice}<p class="account-message auth-notice" role="status">{notice}</p>{/if}
  {#key session.user.id}<App />{/key}
{/if}

<style>
  .auth-page { display: grid; min-height: 100dvh; padding: 32px 20px; place-items: center; }
  .auth-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 18px; max-width: 440px; padding: 32px; width: 100%; }
  .auth-brand { align-items: center; color: var(--accent); display: flex; font-weight: 600; gap: 10px; }
  h1 { font-size: 1.65rem; line-height: 1.2; }
  p, small { color: var(--ink-muted); }
  .google { width: 100%; }
  .auth-divider { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.8rem; gap: 12px; }
  .auth-divider::before, .auth-divider::after { background: var(--hairline); content: ''; flex: 1; height: 1px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  label { font-weight: 500; }
  input { background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); min-height: 44px; min-width: 0; padding: 10px 12px; width: 100%; }
  form .btn { margin-top: 8px; }
  .auth-error { color: var(--danger); }
  .auth-notice { background: var(--ok-tint); border-radius: var(--radius-sm); color: var(--ok); padding: 12px; }
  .auth-links { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
  .local-note { border-top: 1px solid var(--hairline); font-size: 0.78rem; padding-top: 16px; }
  .account-bar { align-items: center; background: var(--surface-2); border-bottom: 1px solid var(--hairline); display: flex; gap: 12px; justify-content: flex-end; min-width: 0; padding: 4px 24px; }
  .account-bar span { color: var(--ink-muted); font-size: 0.8rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .account-bar strong { color: var(--ink); font-weight: 500; }
  .account-message { margin: 8px 24px; }
  @media (max-width: 479px) {
    .auth-page { padding: 20px 12px; }
    .auth-card { gap: 16px; padding: 24px 20px; }
    .account-bar { padding: 4px 12px; }
  }
</style>
