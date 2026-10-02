<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Region } from '../lib/region';
  import type { SavedPart } from '../lib/history';

  let { reference, aligned, region, onback, onnewregion, parts = [], selectedPart = null, onprevious, onnext, onsave }: {
    reference: HTMLImageElement;
    aligned: ImageData;
    region: Region;
    onback: () => void;
    onnewregion: () => void;
    parts?: SavedPart[];
    selectedPart?: SavedPart | null;
    onprevious?: () => void;
    onnext?: () => void;
    onsave?: () => void;
  } = $props();

  let mode = $state<'side-by-side' | 'stacked' | 'overlay'>('side-by-side');
  let opacity = $state(0.5);
  let playing = $state(false);
  let heading: HTMLHeadingElement;
  let referenceCanvas: HTMLCanvasElement;
  let sourceCanvas: HTMLCanvasElement;
  let frame: number | null = null;
  let partIndex = $derived(parts.findIndex((part) => part.id === selectedPart?.id));

  onMount(() => {
    if (window.matchMedia('(max-width: 719px)').matches) mode = 'stacked';
    heading.focus();
  });
  onDestroy(stop);

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    playing = false;
  }

  function play() {
    if (playing) { stop(); return; }
    playing = true;
    opacity = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      opacity = (1 - Math.cos(((now - startedAt) % 1600) / 1600 * 2 * Math.PI)) / 2;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  }

  $effect(() => {
    if (!referenceCanvas || !sourceCanvas) return;
    const { x, y, width, height } = region;
    referenceCanvas.width = sourceCanvas.width = width;
    referenceCanvas.height = sourceCanvas.height = height;
    referenceCanvas.getContext('2d')!.drawImage(reference, x, y, width, height, 0, 0, width, height);
    sourceCanvas.getContext('2d')!.putImageData(aligned, -x, -y, x, y, width, height);
  });
</script>

<section class="parts-page" aria-label="Compare parts">
  <div class="parts-heading">
    <div class="heading-top">
      <h2 bind:this={heading} tabindex="-1">{selectedPart?.name ?? 'Compare parts'}</h2>
      <span>{selectedPart ? `Part ${partIndex + 1} of ${parts.length}` : 'Selected region'}</span>
    </div>
    {#if selectedPart?.note}<p class="part-description">{selectedPart.note}</p>{/if}
  </div>

  <div class="part-toolbar">
    <button class="icon-button" aria-label="Back to whole image" title="Whole image" onclick={onback}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h15" /></svg>
    </button>
    <div class="view-toggle">
      <button class="icon-button" aria-label="Side by side" title="Side by side" aria-pressed={mode === 'side-by-side'} onclick={() => { stop(); mode = 'side-by-side'; }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></svg>
      </button>
      <button class="icon-button" aria-label="Stack vertically" title="Stacked" aria-pressed={mode === 'stacked'} onclick={() => { stop(); mode = 'stacked'; }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="7" rx="1.5" /><rect x="4" y="14" width="16" height="7" rx="1.5" /></svg>
      </button>
      <button class="icon-button" aria-label="Overlay" title="Overlay" aria-pressed={mode === 'overlay'} onclick={() => mode = 'overlay'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="2" /><rect x="9" y="9" width="12" height="12" rx="2" /></svg>
      </button>
    </div>
    {#if mode === 'overlay'}
      <div class="opacity-tools">
      <button class="icon-button" aria-label={playing ? 'Stop opacity animation' : 'Play opacity animation'} aria-pressed={playing} title={playing ? 'Stop' : 'Play'} onclick={play}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{#if playing}<rect x="6" y="6" width="12" height="12" rx="1" />{:else}<path d="m8 5 11 7-11 7Z" />{/if}</svg>
      </button>
      <input type="range" min="0" max="1" step="0.01" bind:value={opacity} aria-label="Overlay opacity" oninput={stop} />
      <output>{Math.round(opacity * 100)}%</output>
      </div>
    {/if}
    <div class="part-actions">
      <button class="icon-button" aria-label="New part" title="New part — select a new region" onclick={onnewregion}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {#if onsave}
        <span title={selectedPart ? 'Already saved — Save part is unavailable for saved parts' : 'Save part'}>
          <button class="icon-button primary" aria-label="Save part" disabled={selectedPart !== null} onclick={onsave}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h9V3M7 21v-8h10v8" /></svg>
          </button>
        </span>
      {/if}
    </div>
  </div>
  <div class="parts-grid" class:stacked={mode === 'stacked'} class:overlay={mode === 'overlay'}>
    <figure><button type="button" class="chip" title="Reference region" aria-label="Reference region">ⓘ</button><canvas bind:this={referenceCanvas} aria-label="Selected reference region"></canvas></figure>
    <figure style:--opacity={opacity}><button type="button" class="chip" title="Aligned source region" aria-label="Aligned source region">ⓘ</button><canvas bind:this={sourceCanvas} aria-label="Corresponding aligned source region"></canvas></figure>
  </div>
  {#if parts.length}
    <nav class="part-dock" aria-label="Saved part navigation">
      <button aria-label="Previous part" title="Previous part" onclick={() => { stop(); onprevious?.(); }} disabled={partIndex <= 0}>‹</button>
      <span class="part-title" title={selectedPart?.name ?? 'Selected region'}>{selectedPart?.name ?? 'Selected region'}</span>
      <span class="part-count">{partIndex < 0 ? '—' : partIndex + 1} / {parts.length}</span>
      <button aria-label="Next part" title="Next part" onclick={() => { stop(); onnext?.(); }} disabled={partIndex >= parts.length - 1}>›</button>
    </nav>
  {/if}
</section>

<style>
  .parts-page { padding-bottom: 8rem; }
  .parts-heading { margin-bottom: 22px; }
  .heading-top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .heading-top h2 { min-width: 0; font-size: 22px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  .heading-top > span { color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
  .part-description { color: var(--muted); font-size: 0.85rem; line-height: 1.65; margin: 8px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  button { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); cursor: pointer; min-height: 44px; padding: 0.5rem 0.75rem; font-size: 0.85rem; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .icon-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; flex-shrink: 0; }
  svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .part-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; }
  .view-toggle { display: flex; border: 1px solid var(--border); border-radius: 8px; background: var(--control-bg); padding: 2px; }
  .view-toggle button { border: 0; background: transparent; }
  .view-toggle button[aria-pressed='true'] { background: var(--accent-tint); color: var(--accent); }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .primary:disabled { background: var(--control-bg); color: var(--muted); border-color: var(--border); }
  .opacity-tools { display: flex; align-items: center; gap: 8px; }
  .parts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin: auto; max-width: 1250px; }
  .parts-grid.stacked { grid-template-columns: 1fr; max-width: 850px; }
  .parts-grid.overlay { display: block; position: relative; }
  figure { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); margin: 0; min-width: 0; overflow: hidden; padding: 7px; position: relative; }
  .overlay figure:last-child { background: transparent; border: 0; box-shadow: none; inset: 0; opacity: var(--opacity); pointer-events: none; position: absolute; }
  .overlay figure:last-child .chip { display: none; }
  canvas { background: #f7f6f3; border-radius: 9px; display: block; height: min(62vh, 680px); object-fit: contain; width: 100%; }
  .overlay figure:first-child canvas { height: min(54vh, 560px); }
  .overlay figure:last-child canvas { height: 100%; }
  .stacked canvas { height: min(38vh, 400px); }
  .chip { align-items: center; backdrop-filter: blur(8px); background: var(--surface-frost); border-radius: 50%; color: var(--accent); display: flex; font-size: 0.8rem; height: 24px; justify-content: center; left: 12px; position: absolute; top: 12px; width: 24px; z-index: 2; }
  .part-dock { align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; bottom: calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow); display: grid; grid-template-columns: 44px minmax(0, 1fr) 64px 44px; gap: 4px; left: 50%; width: 360px; max-width: calc(100vw - 32px); min-height: 60px; padding: 6px; position: fixed; transform: translateX(-50%); white-space: nowrap; z-index: 20; }
  .part-dock button { border: 0; font-size: 1.45rem; width: 44px; }
  .part-title { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; }
  .part-count { font-size: 0.8rem; font-variant-numeric: tabular-nums; text-align: center; }
  input { accent-color: var(--accent); width: 130px; }
  output { font-size: 0.8rem; width: 42px; font-variant-numeric: tabular-nums; }
  .part-actions { display: flex; gap: 8px; margin-left: auto; }
  @media (max-width: 719px) {
    canvas { height: min(42vh, 450px); }
    .part-toolbar { gap: 6px; }
    .part-actions { gap: 4px; }
    .opacity-tools { order: 3; width: 100%; padding-top: 8px; border-top: 1px solid var(--border); }
    input { flex: 1; min-width: 0; width: 100px; }
  }
</style>
