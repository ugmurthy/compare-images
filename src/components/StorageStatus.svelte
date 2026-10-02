<script lang="ts">
  import { storageLevel, type HistoryEntry } from '../lib/history';

  let { entries }: { entries: HistoryEntry[] } = $props();
  let estimate = $state<StorageEstimate | null>(null);
  let open = $state(false);
  let dismissed = $state(false);
  let level = $derived(storageLevel((estimate?.usage ?? 0) / (estimate?.quota || 1)));
  let percent = $derived(Math.round((estimate?.usage ?? 0) / (estimate?.quota || 1) * 100));
  const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;

  async function refresh() {
    try { estimate = await navigator.storage?.estimate() ?? null; }
    catch { estimate = null; }
  }
  $effect(() => { entries; void refresh(); });
</script>

<svelte:window onfocus={refresh} />
<div class="storage" class:open class:dismissed class:warning={level === 'warning'} class:critical={level === 'critical'}>
  <button aria-label={estimate?.quota ? `Browser storage: ${percent}% used` : 'Storage estimate unavailable'} aria-describedby="storage-info" aria-pressed={open} onpointerenter={() => dismissed = false} onfocus={() => dismissed = false} onclick={() => { open = !open; dismissed = !open; }} onkeydown={(event) => { if (event.key === 'Escape') { open = false; dismissed = true; } }}>{estimate?.quota ? `${percent}%` : '—'}</button>
  <div id="storage-info" class="storage-info app-tooltip" role="tooltip">
  {#if estimate?.quota}
    <span>Storage: {percent}% · {level === 'critical' ? 'Critical' : level === 'warning' ? 'Warning' : 'Within limits'}</span>
    <small>{bytes(estimate.usage ?? 0)} / {bytes(estimate.quota)} estimated site quota</small>
    {#if level !== 'ok'}<small>Export history, then delete unneeded entries to free space.</small>{/if}
  {:else}<span>Storage estimate unavailable</span>{/if}
  </div>
</div>

<style>
  .storage { position: relative; color: var(--ok); font-size: 0.8rem; z-index: 40; }
  button { background: transparent; border: 0; color: inherit; font: inherit; cursor: pointer; min-width: 44px; min-height: 44px; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
  .warning { color: var(--warning); }
  .critical { color: var(--danger); }
  .storage-info { display: none; gap: 8px; position: fixed; margin-top: 8px; right: 16px; width: 260px; box-sizing: border-box; max-width: calc(100vw - 32px); }
  .storage:not(.dismissed):hover .storage-info, .storage:not(.dismissed):focus-within .storage-info, .storage.open .storage-info { display: grid; }
  small { font-size: 0.75rem; color: var(--muted); }
</style>
