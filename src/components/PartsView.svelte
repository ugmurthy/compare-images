<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  import type { Region } from '../lib/region';
  import type { SavedPart } from '../lib/history';

  let { reference, aligned, region, onback, onnewregion, onmeasure, parts = [], selectedPart = null, onprevious, onnext, onsave }: {
    reference: HTMLImageElement;
    aligned: ImageData;
    region: Region;
    onback: () => void;
    onnewregion: () => void;
    onmeasure: () => void;
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
  let overlayCanvas: HTMLCanvasElement | undefined = $state();
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

  $effect(() => {
    if (!overlayCanvas) return;
    const { x, y, width, height } = region;
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    overlayCanvas.getContext('2d')!.putImageData(aligned, -x, -y, x, y, width, height);
  });
</script>

<section class="parts-page" class:has-dock={parts.length > 0} aria-label="Compare parts">
  <div class="parts-heading">
    <button class="btn quiet back" aria-label="Back to whole image" title="Back to the whole image — keeps your selection" onclick={onback}>
      <Icon name="back" /><span>Whole image</span>
    </button>
    <div class="heading-text">
      <div class="heading-top">
        <h2 bind:this={heading} tabindex="-1">{selectedPart?.name ?? 'Selected part'}</h2>
        <span class="chip" class:ok={!!selectedPart}>{selectedPart ? `Part ${partIndex + 1} of ${parts.length}` : 'Not saved yet'}</span>
      </div>
      {#if selectedPart?.note}<p class="part-description">{selectedPart.note}</p>{/if}
    </div>
  </div>

  <div class="part-toolbar toolbar" role="toolbar" aria-label="Part tools">
    <div class="segmented icons" role="group" aria-label="Layout">
      <button aria-label="Side by side" title="Side by side" aria-pressed={mode === 'side-by-side'} onclick={() => { stop(); mode = 'side-by-side'; }}>
        <Icon name="side-by-side" />
      </button>
      <button aria-label="Stack vertically" title="Stacked" aria-pressed={mode === 'stacked'} onclick={() => { stop(); mode = 'stacked'; }}>
        <Icon name="stacked" />
      </button>
      <button aria-label="Overlay" title="Overlay — source on top of reference" aria-pressed={mode === 'overlay'} onclick={() => mode = 'overlay'}>
        <Icon name="overlay" />
      </button>
    </div>
    {#if mode === 'overlay'}
      <div class="opacity-tools">
        <button class="btn icon" aria-label={playing ? 'Stop opacity animation' : 'Play opacity animation'} aria-pressed={playing} title={playing ? 'Stop' : 'Play — fade between reference and source'} onclick={play}>
          <Icon name={playing ? 'stop' : 'play'} />
        </button>
        <label class="opacity-control">
          <span class="opacity-end">Ref</span>
          <input type="range" min="0" max="1" step="0.01" bind:value={opacity} aria-label="Overlay opacity" oninput={stop} />
          <span class="opacity-end">Source</span>
          <output>{Math.round(opacity * 100)}%</output>
        </label>
      </div>
    {/if}
    <span class="tool-sep" aria-hidden="true"></span>
    <button class="btn" data-focus="measure-part" title="Measure distances in this part of the reference" onclick={onmeasure}><Icon name="measure" /><span class="label">Measure part</span></button>
    <span class="tool-spacer"></span>
    <button class="btn" aria-label="New part" title="New part — select a new region on the whole image" onclick={onnewregion}>
      <Icon name="select" /><span class="label" aria-hidden="true">New part</span>
    </button>
    {#if onsave}
      <span title={selectedPart ? 'This part is already saved' : 'Save this part with a name and notes'}>
        <button class="btn primary" aria-label="Save part" disabled={selectedPart !== null} onclick={onsave}>
          <Icon name={selectedPart ? 'check' : 'save'} /><span class="label" aria-hidden="true">{selectedPart ? 'Saved' : 'Save part'}</span>
        </button>
      </span>
    {/if}
  </div>
  <div class="parts-grid" class:stacked={mode === 'stacked'} class:overlay={mode === 'overlay'}>
    <figure class="frame">
      <figcaption class="frame-caption">
        {#if mode === 'overlay'}
          <span class="swatch reference" aria-hidden="true"></span><strong>Reference</strong><span aria-hidden="true">+</span><span class="swatch source" aria-hidden="true"></span><strong>Source</strong>
          <span class="aside tabular">Source {Math.round(opacity * 100)}%</span>
        {:else}
          <span class="swatch reference" aria-hidden="true"></span><strong>Reference</strong><span class="file">this part</span>
        {/if}
      </figcaption>
      <div class="canvas-wrap">
        <canvas bind:this={referenceCanvas} aria-label="Selected reference region"></canvas>
        {#if mode === 'overlay'}<canvas class="overlay-canvas" style:opacity={opacity} aria-hidden="true" bind:this={overlayCanvas}></canvas>{/if}
      </div>
    </figure>
    <figure class="frame source-frame">
      <figcaption class="frame-caption"><span class="swatch source" aria-hidden="true"></span><strong>Source</strong><span class="file">aligned</span></figcaption>
      <div class="canvas-wrap"><canvas bind:this={sourceCanvas} aria-label="Corresponding aligned source region"></canvas></div>
    </figure>
  </div>
  {#if parts.length}
    <nav class="part-dock" aria-label="Saved part navigation">
      <span title="Previous part"><button class="btn icon quiet" aria-label="Previous part" onclick={() => { stop(); onprevious?.(); }} disabled={partIndex <= 0}><Icon name="previous" /></button></span>
      <span class="part-title" title={selectedPart?.name ?? 'Selected part'}><strong>{selectedPart?.name ?? 'Selected part'}</strong><small>{partIndex < 0 ? '—' : partIndex + 1} / {parts.length}</small></span>
      <span title="Next part"><button class="btn icon quiet" aria-label="Next part" onclick={() => { stop(); onnext?.(); }} disabled={partIndex >= parts.length - 1}><Icon name="next" /></button></span>
    </nav>
  {/if}
</section>

<style>
  .parts-page { display: flex; flex-direction: column; gap: 12px; }
  .parts-page.has-dock { --dock-space: 72px; padding-bottom: 88px; }
  .parts-heading { align-items: flex-start; display: flex; gap: 8px; }
  .back { color: var(--ink-muted); margin-left: -6px; }
  .heading-text { min-width: 0; padding-top: 4px; }
  .heading-top { align-items: center; display: flex; flex-wrap: wrap; gap: 8px 10px; }
  .heading-top h2 { font-size: 1.4rem; line-height: 1.25; min-width: 0; overflow-wrap: anywhere; }
  .heading-top h2:focus { outline: none; }
  .part-description { color: var(--ink-muted); font-size: 0.875rem; line-height: 1.6; margin-top: 4px; max-width: 80ch; overflow-wrap: anywhere; white-space: pre-wrap; }
  .part-toolbar { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 8px; position: sticky; top: calc(var(--app-bar-height) + 8px); z-index: 20; }
  .opacity-tools { align-items: center; display: flex; gap: 8px; }
  .opacity-control { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.75rem; gap: 6px; }
  .opacity-control input { width: 140px; }
  .opacity-control output { color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; width: 2.6rem; }
  .parts-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 auto; max-width: 1400px; width: 100%; }
  .parts-grid.stacked { grid-template-columns: 1fr; max-width: 900px; }
  .parts-grid.overlay { grid-template-columns: 1fr; max-width: 1100px; }
  .overlay .source-frame { display: none; }
  figure { margin: 0; }
  .canvas-wrap { background: var(--canvas-bg); padding: 8px; position: relative; }
  canvas { display: block; height: clamp(280px, calc(100dvh - 310px - var(--dock-space, 0px)), 860px); object-fit: contain; width: 100%; }
  .stacked canvas { height: clamp(220px, 42vh, 460px); }
  .overlay-canvas { height: calc(100% - 16px); left: 8px; pointer-events: none; position: absolute; top: 8px; width: calc(100% - 16px); }
  .tabular { font-variant-numeric: tabular-nums; }
  .part-dock { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); bottom: calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow-lg); display: grid; gap: 4px; grid-template-columns: 40px minmax(0, 1fr) 40px; left: 50%; max-width: calc(100vw - 32px); padding: 6px; position: fixed; transform: translateX(-50%); width: 340px; z-index: 20; }
  .part-title { display: grid; line-height: 1.25; min-width: 0; text-align: center; }
  .part-title strong { font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .part-title small { color: var(--ink-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
  @media (max-width: 1180px) {
    .part-toolbar :global(.btn .label) { border: 0; clip: rect(0 0 0 0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px; }
    .part-toolbar :global(.btn:has(.label)) { padding: 0; width: 40px; }
  }
  @media (max-width: 719px) {
    .part-toolbar { gap: 6px; padding: 6px; }
    .part-toolbar .tool-sep { display: none; }
    .opacity-tools { order: 10; width: 100%; }
    .opacity-control { flex: 1; }
    .opacity-control input { flex: 1; width: auto; }
    .canvas-wrap { padding: 4px; }
    canvas, .stacked canvas { height: auto; max-height: 56vh; }
    .overlay-canvas { height: calc(100% - 8px); left: 4px; top: 4px; width: calc(100% - 8px); }
  }
</style>
