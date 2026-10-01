<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { Region } from '../lib/region';
  import type { SavedPart } from '../lib/history';
  import NotePreview from './NotePreview.svelte';

  let { reference, aligned, region, onback, onadjust, onnewregion, parts = [], selectedPart = null, onprevious, onnext, onsave, onsavecomparison }: {
    reference: HTMLImageElement;
    aligned: ImageData;
    region: Region;
    onback: () => void;
    onadjust: () => void;
    onnewregion: () => void;
    parts?: SavedPart[];
    selectedPart?: SavedPart | null;
    onprevious?: () => void;
    onnext?: () => void;
    onsave?: () => void;
    onsavecomparison?: () => void;
  } = $props();

  let mode = $state<'side-by-side' | 'stacked' | 'overlay'>('side-by-side');
  let opacity = $state(0.5);
  let playing = $state(false);
  let menuOpen = $state(false);
  let menuButton: HTMLButtonElement = $state()!;
  let menuElement: HTMLElement = $state()!;
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

  function menuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      menuOpen = false;
      void tick().then(() => menuButton.focus());
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const items = [...menuElement.querySelectorAll<HTMLButtonElement>('button')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
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
    <button class="back" onclick={onback}>← &nbsp; Whole image</button>
    <div class="title-card">
      <h2 bind:this={heading} tabindex="-1">{selectedPart?.name ?? 'Compare parts'}</h2>
      {#if selectedPart}<NotePreview note={selectedPart.note} />{/if}
      <span>{selectedPart ? `Part ${partIndex + 1} of ${parts.length}` : 'Selected region'}</span>
    </div>
  </div>

  <div class="part-toolbar">
    <div class="view-toggle">
    <button aria-label="Side by side" aria-pressed={mode === 'side-by-side'} onclick={() => { stop(); mode = 'side-by-side'; }}>Side by side</button>
    <button aria-label="Stack vertically" aria-pressed={mode === 'stacked'} onclick={() => { stop(); mode = 'stacked'; }}>Stacked</button>
    <button aria-label="Overlay" aria-pressed={mode === 'overlay'} onclick={() => mode = 'overlay'}>Overlay</button>
    </div>
    {#if mode === 'overlay'}
      <div class="opacity-tools">
      <button aria-label={playing ? 'Stop opacity animation' : 'Play opacity animation'} aria-pressed={playing} title={playing ? 'Stop' : 'Play'} onclick={play}>{playing ? '■' : '▷'}</button>
      <input type="range" min="0" max="1" step="0.01" bind:value={opacity} aria-label="Overlay opacity" oninput={stop} />
      <output>{Math.round(opacity * 100)}%</output>
      </div>
    {/if}
    <button onclick={onadjust}>Adjust region</button>
    <button onclick={onnewregion}>＋ New part</button>
    {#if onsave}<button class="primary" onclick={onsave}>Save part</button>{/if}
  <div class="part-actions">
    {#if menuOpen}<div class="action-menu" role="menu" aria-label="Part actions" tabindex="-1" bind:this={menuElement} onkeydown={menuKeydown}>
      {#if onsave}<button role="menuitem" onclick={() => { menuOpen = false; onsave?.(); }}>Save part details</button>{/if}
      <button role="menuitem" onclick={onadjust}>Adjust region on whole image</button>
      <button role="menuitem" onclick={onnewregion}>Select a new region</button>
      <button role="menuitem" onclick={() => { menuOpen = false; onsavecomparison?.(); }}>Save comparison</button>
    </div>{/if}
    <button bind:this={menuButton} aria-label="More part actions" aria-expanded={menuOpen} onclick={() => { menuOpen = !menuOpen; if (menuOpen) void tick().then(() => menuElement.querySelector('button')?.focus()); }}>More ···</button>
  </div>
  </div>
  <div class="parts-grid" class:stacked={mode === 'stacked'} class:overlay={mode === 'overlay'}>
    <figure><button type="button" class="chip" title="Reference region" aria-label="Reference region">ⓘ<span>Reference</span></button><canvas bind:this={referenceCanvas} aria-label="Selected reference region"></canvas></figure>
    <figure style:--opacity={opacity}><button type="button" class="chip" title="Aligned source region" aria-label="Aligned source region">ⓘ<span>Aligned source</span></button><canvas bind:this={sourceCanvas} aria-label="Corresponding aligned source region"></canvas></figure>
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

<svelte:window onpointerdown={(event) => { if (menuOpen && !(event.target as Element).closest('.part-actions')) menuOpen = false; }} />

<style>
  .parts-page { padding-bottom: 8rem; }
  .parts-heading { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
  .back { align-self: start; }
  .title-card { min-width: 0; flex: 1; }
  .title-card h2 { font-size: 22px; font-weight: 600; margin: 0; overflow-wrap: anywhere; }
  .title-card > span { color: var(--muted); font-size: 0.8rem; }
  .title-card :global(.note) { color: var(--muted); font-size: 0.85rem; max-width: 80%; }
  button { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); cursor: pointer; min-height: 44px; padding: 0.5rem 0.75rem; font-size: 0.85rem; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .back { white-space: nowrap; }
  .part-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; }
  .view-toggle { display: flex; border: 1px solid var(--border); border-radius: 8px; background: var(--control-bg); padding: 2px; }
  .view-toggle button { border: 0; background: transparent; }
  .view-toggle button[aria-pressed='true'] { background: var(--accent-tint); color: var(--accent); }
  .primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
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
  .chip span { background: var(--tooltip); border-radius: 6px; color: var(--on-accent); display: none; font-size: 0.72rem; left: 32px; padding: 0.4rem; position: absolute; white-space: nowrap; }
  .chip:hover span, .chip:focus-visible span { display: block; }
  .part-dock { align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; bottom: calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow); display: grid; grid-template-columns: 44px minmax(0, 1fr) 64px 44px; gap: 4px; left: 50%; width: 360px; max-width: calc(100vw - 32px); min-height: 60px; padding: 6px; position: fixed; transform: translateX(-50%); white-space: nowrap; z-index: 20; }
  .part-dock button { border: 0; font-size: 1.45rem; width: 44px; }
  .part-title { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; }
  .part-count { font-size: 0.8rem; font-variant-numeric: tabular-nums; text-align: center; }
  input { accent-color: var(--accent); width: 130px; }
  output { font-size: 0.8rem; padding-right: 0.5rem; }
  .part-actions { position: relative; z-index: 21; }
  .action-menu { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); display: grid; width: 260px; max-width: calc(100vw - 32px); padding: 8px; position: absolute; right: 0; top: calc(100% + 8px); }
  .action-menu button { border: 0; text-align: left; }
  .action-menu button:hover, .action-menu button:focus-visible { background: var(--accent-tint); color: var(--accent); }
  @media (max-width: 719px) {
    .parts-heading { display: block; }
    .title-card { margin-top: 1rem; }
    canvas { height: min(42vh, 450px); }
    .view-toggle { width: 100%; }
    .view-toggle button { flex: 1; }
    .part-toolbar > button, .part-actions { flex: 1; }
    .part-actions > button { width: 100%; }
    input { width: 100px; }
    output { padding-right: 0.2rem; }
  }
</style>
