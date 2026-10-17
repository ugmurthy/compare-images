<script lang="ts">
  import { onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  import { overlayGif } from '../lib/overlayGif';
  import type { Region } from '../lib/region';

  let { reference, source, region, sourceName }: {
    reference: HTMLImageElement;
    source: HTMLImageElement | ImageData;
    region?: Region;
    sourceName: string;
  } = $props();

  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let controller: AbortController | undefined;
  onDestroy(() => controller?.abort());

  async function download() {
    if (busy) return;
    busy = true;
    error = '';
    status = 'Preparing GIF…';
    const job = new AbortController();
    controller = job;
    const basename = sourceName.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || 'source';
    const filename = `${basename}${region ? '-part' : ''}-overlay.gif`;
    try {
      const blob = await overlayGif(reference, source, region, job.signal, (message) => status = message);
      job.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status = `Download started: ${filename} (${(blob.size / 1_000_000).toFixed(2)} MB)`;
    } catch (cause) {
      if (!job.signal.aborted) { status = ''; error = `Could not create GIF: ${(cause as Error).message}`; }
    } finally { busy = false; }
  }
</script>

<button class="btn" aria-label="Download animation GIF" aria-busy={busy} disabled={busy}
  title="Download a looping 1.6-second fade: up to 640px, 12.5 fps, under 4 MB. Images stay in your browser."
  onclick={download}><Icon name="export" /><span>{busy ? 'Creating…' : 'GIF'}</span></button>
{#if status}<span class="gif-status" role="status">{status}</span>{/if}
{#if error}<span class="gif-status error" role="alert">{error}</span>{/if}

<style>
  .gif-status { color: var(--ink-muted); flex-basis: 100%; font-size: 0.8rem; order: 20; overflow-wrap: anywhere; }
  .gif-status.error { color: var(--danger); }
</style>
