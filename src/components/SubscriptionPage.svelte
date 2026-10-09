<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import ThemeSelect from './ThemeSelect.svelte';
  import { billing, planNames, purchasePlan, type Membership, type PlanId, type Price } from '../lib/subscriptions';

  let { member = null, email = '', active = false, onChoose, onBack, onRefresh, onSignOut }:
    { member?: Membership | null; email?: string; active?: boolean; onChoose?: (plan: PlanId) => void;
      onBack: () => void; onRefresh?: () => Promise<void>; onSignOut?: () => Promise<void> } = $props();
  let prices = $state<Price[]>([]);
  let loading = $state(true);
  let busy = $state<PlanId | null>(null);
  let error = $state('');
  let notice = $state('');
  const referralLink = $derived(member ? `${window.location.origin}/?ref=${member.referral_code}` : '');
  const descriptions: Record<PlanId, string> = {
    free: 'Three months to explore every tool. No card needed.',
    yearly: 'Twelve more months of full access. Renew when you choose.',
    lifetime: 'One payment. All features, with no expiry date.'
  };

  async function loadPrices() {
    loading = true;
    error = '';
    try { prices = (await billing<{ plans: Price[] }>({ action: 'prices' })).plans; }
    catch { error = 'Prices are unavailable right now. Please try again.'; }
    finally { loading = false; }
  }
  onMount(() => { void loadPrices(); });

  function priceLabel(id: PlanId) {
    if (id === 'free') return 'Free';
    const price = prices.find((item) => item.id === id);
    return price?.amount ? new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(price.amount / 100) : 'Price coming soon';
  }
  async function subscribe(plan: PlanId) {
    if (!member) { onChoose?.(plan); return; }
    if (plan === 'free' || busy) return;
    busy = plan;
    error = '';
    notice = '';
    try {
      if (await purchasePlan(plan, email)) {
        await onRefresh?.();
        notice = 'Payment verified. Your access has been updated.';
      } else notice = 'Checkout closed. Your access has not changed.';
    } catch {
      error = 'Payment could not be confirmed. If you were charged, do not pay again: refresh your access while the payment confirmation is processed.';
    } finally { busy = null; }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(referralLink); notice = 'Referral link copied.'; }
    catch { notice = 'Select and copy the referral link below.'; }
  }
</script>

<div class="subscriptions">
  <header>
    <span class="brand"><Icon name="logo" size={24} />Compare Sketch</span>
    <div class="toolbar"><ThemeSelect />
      {#if !member || active}<button class="btn quiet" disabled={!!busy} onclick={onBack}>{member ? 'Back to app' : 'Back to sign in'}</button>{/if}
      {#if onSignOut}<button class="btn" disabled={!!busy} onclick={() => void onSignOut?.()}>Sign out</button>{/if}</div>
  </header>
  <main>
    <div class="intro"><span class="chip accent">All features on every plan</span><h1>Your sketches. Your pace.</h1>
      <p>Align, compare, measure, and save your work — choose how long you’d like access.</p></div>
    {#if member}
      <section class="membership" aria-label="Current subscription">
        <div><h2>{planNames[member.plan]} access <span class:expired={!active} class="chip">{active ? 'Active' : 'Expired'}</span></h2>
          <p>{member.plan === 'lifetime' ? 'Yours for life. No renewal needed.' : `Access ${active ? 'until' : 'ended'} ${member.expires_at ? new Date(member.expires_at).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}.`}</p>
          {#if member.selected_plan !== member.plan}<p>You selected {planNames[member.selected_plan]}. Complete payment below to upgrade.</p>{/if}
        </div>
        <button class="btn" disabled={!!busy} onclick={() => void onRefresh?.()}>Refresh access</button>
      </section>
    {/if}
    {#if loading}<p role="status">Loading prices…</p>{/if}
    <div class="plans">
      {#each ['free', 'yearly', 'lifetime'] as id}
        {@const plan = id as PlanId}
        {@const available = prices.find((item) => item.id === plan)?.enabled}
        <section class="plan" class:recommended={plan === 'yearly'} aria-label={`${planNames[plan]} plan`}>
          <div class="plan-heading"><h2>{planNames[plan]}</h2>{#if plan === 'yearly'}<span class="chip accent">Keep creating</span>{/if}</div>
          <div class="price">{priceLabel(plan)}</div>
          <p class="term">{plan === 'free' ? '3 months · once per account' : plan === 'yearly' ? '12 months · one-time payment' : 'Forever · one-time payment'}</p>
          <p>{descriptions[plan]}</p>
          <ul><li>Auto and manual alignment</li><li>Overlay and side-by-side comparison</li><li>Precision measurement and magnifier</li><li>Local history, parts, and exports</li></ul>
          <button class="btn" class:primary={plan === 'yearly'} disabled={!!busy || (member ? plan === 'free' || member.plan === 'lifetime' || !available : plan !== 'free' && !available)}
            onclick={() => void subscribe(plan)}>
            {busy === plan ? 'Processing…' : member?.plan === 'lifetime' ? (plan === 'lifetime' ? 'Lifetime active' : 'Included in Lifetime') : plan === 'free' && member ? (active ? 'Trial included' : 'Trial ended') : !available && plan !== 'free' ? 'Coming soon' : member ? (member.plan === 'yearly' && plan === 'yearly' ? 'Extend yearly access' : `Get ${planNames[plan]}`) : `Choose ${planNames[plan]}`}
          </button>
        </section>
      {/each}
    </div>
    <p class="payment-note">Paid plans use secure Razorpay checkout. No automatic renewals. Yearly purchases add 12 months to your remaining access, or start today if it has expired.</p>
    {#if error}<p class="error" role="alert">{error}</p><button class="btn" disabled={!!busy} onclick={() => void loadPrices()}>Retry prices</button>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <section class="referrals" aria-labelledby="referral-heading">
      <div><span class="chip accent">Create together</span><h2 id="referral-heading">Give a friend a fresh perspective.</h2>
        <p>Share your signup link with up to two new users. Each confirmed signup that opens the app earns you three extra months — up to six months in total.</p></div>
      {#if member}
        <div class="referral-details"><strong>{member.referrals_used} of 2 referrals rewarded</strong>
          {#if member.plan === 'lifetime'}<p>You can still invite friends. Lifetime access already has no expiry to extend.</p>{/if}
          {#if member.referrals_used < 2}
            <label for="referral-link">Your referral link</label><div class="link-row"><input id="referral-link" readonly value={referralLink} onclick={(event) => event.currentTarget.select()} /><button class="btn" onclick={() => void copyLink()}>Copy link</button></div>
          {:else}<p>You’ve used both referral rewards. Thank you for sharing Compare Sketch.</p>{/if}
          {#if member.referral_result === 'unavailable'}<p>Your signup referral was invalid or already fully used. Your own access is unaffected.</p>{/if}
        </div>
      {:else}<p>Create an account to get your personal referral link.</p>{/if}
    </section>
    {#if member && !active}<p class="payment-note">Your saved sketches remain in this browser. Subscribe or earn a referral extension to reopen the workspace.</p>{/if}
  </main>
</div>

<style>
  .subscriptions { min-height: 100dvh; }
  header { align-items: center; border-bottom: 1px solid var(--hairline); display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; padding: 16px 32px; }
  .brand { align-items: center; color: var(--accent); display: flex; font-weight: 600; gap: 10px; }
  main { margin: auto; max-width: 1120px; padding: 48px 32px; }
  .intro { margin-bottom: 32px; text-align: center; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.8rem); margin: 14px 0 10px; }
  h2 { font-size: 1.15rem; }
  p { color: var(--ink-muted); }
  .membership { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; margin-bottom: 24px; padding: 20px 24px; }
  .membership h2 { align-items: center; display: flex; gap: 12px; margin-bottom: 6px; }
  .expired { color: var(--danger); }
  .plans { display: grid; gap: 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .plan { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 16px; padding: 24px; }
  .recommended { border-color: var(--accent-ring); box-shadow: var(--shadow); }
  .plan-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
  .price { font-size: 1.8rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.2; }
  .term { font-size: 0.8rem; margin-top: -6px; }
  ul { color: var(--ink-muted); display: grid; font-size: 0.85rem; gap: 10px; list-style-position: inside; margin: 4px 0 8px; }
  .plan .btn { margin-top: auto; }
  .payment-note { font-size: 0.82rem; line-height: 1.6; margin: 20px 0; text-align: center; }
  .referrals { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--radius-lg); display: grid; gap: 24px; margin-top: 32px; padding: 28px; }
  .referrals h2 { margin: 12px 0 8px; }
  .referrals p { max-width: 740px; }
  .referral-details { display: grid; gap: 12px; }
  label { font-size: 0.8rem; }
  .link-row { display: flex; gap: 10px; }
  input { background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); flex: 1; min-width: 0; padding: 10px 12px; }
  .error { color: var(--danger); margin: 16px 0; }
  .notice { background: var(--ok-tint); border-radius: var(--radius-sm); color: var(--ok); margin: 16px 0; padding: 12px; }
  @media (max-width: 760px) {
    header { padding: 16px; }
    main { padding: 32px 16px; }
    .plans { grid-template-columns: 1fr; }
    .plan, .referrals, .membership { padding: 22px; }
    .link-row { align-items: stretch; flex-direction: column; }
  }
</style>
