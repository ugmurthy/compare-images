<script lang="ts">
  import { storageLevel, type HistoryEntry } from '../lib/history';

  let { entries }: { entries: HistoryEntry[] } = $props();
  let estimate = $state<StorageEstimate | null>(null);
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
<details class="storage" class:warning={level === 'warning'} class:critical={level === 'critical'}>
  <summary aria-label={estimate?.quota ? `Browser storage: ${percent}% used` : 'Storage estimate unavailable'} title={estimate?.quota ? `${bytes(estimate.usage ?? 0)} / ${bytes(estimate.quota)} estimated browser quota` : 'Storage estimate unavailable'}>{estimate?.quota ? `${percent}%` : '—'}</summary>
  <div class="storage-info" role="status">
  {#if estimate?.quota}
    <span>Storage: {percent}% · {level === 'critical' ? 'Critical' : level === 'warning' ? 'Warning' : 'Within limits'}</span>
    <small>{bytes(estimate.usage ?? 0)} / {bytes(estimate.quota)} estimated site quota</small>
    {#if level !== 'ok'}<small>Export history, then delete unneeded entries to free space.</small>{/if}
  {:else}<span>Storage estimate unavailable</span>{/if}
  </div>
</details>

<style>
  .storage { position: relative; color: var(--ok); font-size: 0.8rem; z-index: 40; }
  summary { list-style: none; cursor: pointer; min-width: 44px; min-height: 44px; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
  summary::-webkit-details-marker { display: none; }
  .warning { color: var(--warning); }
  .critical { color: var(--danger); }
  .storage-info { display: grid; gap: 8px; position: fixed; margin-top: 8px; right: 16px; width: 260px; max-width: calc(100vw - 32px); padding: 16px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }
  small { font-size: 0.75rem; color: var(--muted); }
</style>
