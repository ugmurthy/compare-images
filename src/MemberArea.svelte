<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '@supabase/supabase-js';
  import App from './App.svelte';
  import AccountMenu from './components/AccountMenu.svelte';
  import SubscriptionPage from './components/SubscriptionPage.svelte';
  import FeedbackPage from './components/FeedbackPage.svelte';
  import { activateMembership, type Membership } from './lib/subscriptions';

  let { user, busy, onSignOut }: { user: User; busy: boolean; onSignOut: () => Promise<void> } = $props();
  let member = $state<Membership | null>(null);
  let error = $state('');
  let loading = $state(true);
  let showPrices = $state(window.location.pathname === '/pricing');
  let showFeedback = $state(window.location.pathname === '/feedback');
  let now = $state(Date.now());
  let disposed = false;
  const active = $derived(!!member && (member.plan === 'lifetime' || (!!member.expires_at && new Date(member.expires_at).getTime() > now)));

  async function refresh() {
    error = '';
    try {
      const next = await activateMembership();
      if (!disposed) { member = next; now = Date.now(); }
    } catch { if (!disposed) error = 'Could not check your subscription. Please retry. If this is a new installation, the membership backend must be configured.'; }
    finally { if (!disposed) loading = false; }
  }
  function navigate(path: '/' | '/pricing' | '/pricing#referrals' | '/feedback') {
    showPrices = path.startsWith('/pricing');
    showFeedback = path === '/feedback';
    window.history.pushState(null, '', path);
    window.scrollTo(0, 0);
  }
  onMount(() => {
    void refresh().then(() => {
      if (!disposed && member && member.selected_plan !== member.plan && !showFeedback) navigate('/pricing');
    });
    const timer = window.setInterval(() => { now = Date.now(); }, 1000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', focus); };
  });
</script>

<svelte:window onpopstate={() => {
  showPrices = window.location.pathname === '/pricing';
  showFeedback = window.location.pathname === '/feedback';
}} />

{#if loading || !member}
  <main class="membership-gate">
    <section><h1>{loading ? 'Checking your access…' : 'Subscription unavailable'}</h1>
      {#if error}<p role="alert">{error}</p><button class="btn primary" onclick={() => void refresh()}>Retry</button>{:else}<p role="status">Loading your subscription securely.</p>{/if}
      <button class="btn" disabled={busy} onclick={() => void onSignOut()}>Sign out</button>
    </section>
  </main>
{:else}
  {#if active}
    <!-- Retain comparison data, but remove workspace controls and shortcuts. -->
    <App suspended={showPrices || showFeedback}>
      {#snippet account()}<AccountMenu {user} {busy} {onSignOut} onSubscription={() => navigate('/pricing')} onInvite={() => navigate('/pricing#referrals')} onFeedback={() => navigate('/feedback')} />{/snippet}
    </App>
  {/if}
  {#if showFeedback}
    <FeedbackPage onBack={() => navigate('/')} />
  {:else if showPrices || !active}
    <SubscriptionPage {member} email={user.email ?? ''} {active} onBack={() => navigate('/')} onRefresh={refresh} {onSignOut} onFeedback={() => navigate('/feedback')} />
  {/if}
  {#if error}<p class="member-error" role="alert">{error}</p>{/if}
{/if}

<style>
  .membership-gate { display: grid; min-height: 100dvh; padding: 24px; place-items: center; }
  section { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); display: flex; flex-wrap: wrap; gap: 16px; max-width: 520px; padding: 32px; }
  h1 { font-size: 1.6rem; }
  p { color: var(--ink-muted); width: 100%; }
  .member-error { color: var(--danger); margin: 16px 24px; }
</style>
