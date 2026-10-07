<script lang="ts">
  import { tick } from 'svelte';
  import type { User } from '@supabase/supabase-js';

  let { user, busy, onSignOut }: { user: User; busy: boolean; onSignOut: () => Promise<void> } = $props();
  const id = $props.id();
  let open = $state(false);
  let container: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let signOutItem = $state<HTMLButtonElement>();
  const initial = $derived((user.email?.charAt(0) || '?').toUpperCase());

  async function openMenu() {
    open = true;
    await tick();
    signOutItem?.focus();
  }

  function closeMenu() {
    open = false;
    trigger.focus();
  }

  function pointerDown(event: PointerEvent) {
    if (open && event.target instanceof Node && !container.contains(event.target)) open = false;
  }

  function focusOut(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) open = false;
  }

  function keyDown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    } else if ((open || event.target === trigger) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (open) signOutItem?.focus();
      else void openMenu();
    }
  }
</script>

<svelte:window onpointerdown={pointerDown} onkeydown={keyDown} />

<div class="account" bind:this={container} onfocusout={focusOut}>
  <button class="account-avatar" bind:this={trigger} id={`${id}-trigger`} type="button"
    aria-label="Account menu" title="Account menu" aria-haspopup="menu" aria-expanded={open}
    aria-controls={open ? `${id}-menu` : undefined} onclick={() => open ? closeMenu() : void openMenu()}>
    <span aria-hidden="true">{initial}</span>
  </button>
  {#if open}
    <div class="account-menu popover" id={`${id}-menu`} role="menu" aria-labelledby={`${id}-trigger`}>
      <div class="account-details" role="presentation">
        <span>Signed in as</span>
        <strong>{user.email ?? 'your account'}</strong>
      </div>
      <button class="btn quiet" bind:this={signOutItem} type="button" role="menuitem" disabled={busy} onclick={() => void onSignOut()}>
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  {/if}
</div>

<style>
  .account { flex: none; position: relative; }
  .account-avatar { align-items: center; background: var(--accent-tint); border: 1px solid var(--accent-ring); border-radius: 50%; color: var(--accent); cursor: pointer; display: flex; font-size: 0.85rem; font-weight: 600; height: 36px; justify-content: center; margin: 2px; width: 36px; }
  .account-avatar:hover, .account-avatar[aria-expanded='true'] { background: var(--accent); color: var(--on-accent); }
  .account-menu { max-width: calc(100vw - 24px); padding: 6px; position: absolute; right: 0; top: calc(100% + 10px); width: 280px; z-index: 40; }
  .account-details { border-bottom: 1px solid var(--hairline); display: grid; gap: 4px; margin-bottom: 6px; padding: 12px; }
  .account-details span { color: var(--ink-muted); font-size: 0.75rem; }
  .account-details strong { font-weight: 500; overflow-wrap: anywhere; }
  .account-menu .btn { justify-content: flex-start; width: 100%; }
</style>
