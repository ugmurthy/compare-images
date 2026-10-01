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
<div class="storage" class:warning={level === 'warning'} class:critical={level === 'critical'} aria-live="polite">
  {#if estimate?.quota}
    <span>Storage: {percent}% · {level === 'critical' ? 'Critical' : level === 'warning' ? 'Warning' : 'Within limits'}</span>
    <small>{bytes(estimate.usage ?? 0)} / {bytes(estimate.quota)} estimated site quota</small>
    {#if level !== 'ok'}<small>Export history, then delete unneeded entries to free space.</small>{/if}
  {:else}<span>Storage estimate unavailable</span>{/if}
</div>

<style>
  .storage { background: #e9f8ef; border: 1px solid #bde8cb; border-radius: 10px; color: #126b34; display: grid; font-size: 0.75rem; gap: 0.2rem; padding: 0.5rem 0.75rem; }
  .warning { background: #fff7db; border-color: #e7c667; color: #795400; }
  .critical { background: #fff0f0; border-color: #fecaca; color: #a51d28; }
  small { font-size: 0.68rem; }
</style>
