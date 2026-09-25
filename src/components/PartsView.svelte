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

  let mode = $state<'side-by-side' | 'stacked' | 'overlay'>('overlay');
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
    if (window.innerWidth < 720) mode = 'stacked';
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

  <div class="parts-grid" class:stacked={mode === 'stacked'} class:overlay={mode === 'overlay'}>
    <figure><button type="button" class="chip" title="Reference region" aria-label="Reference region">ⓘ<span>Reference</span></button><canvas bind:this={referenceCanvas} aria-label="Selected reference region"></canvas></figure>
    <figure style:--opacity={opacity}><button type="button" class="chip" title="Aligned source region" aria-label="Aligned source region">ⓘ<span>Aligned source</span></button><canvas bind:this={sourceCanvas} aria-label="Corresponding aligned source region"></canvas></figure>
  </div>

  <nav class="part-dock" aria-label="Part comparison controls">
    {#if parts.length}
      <button aria-label="Previous part" title="Previous part" onclick={onprevious} disabled={partIndex <= 0}>‹</button>
      <span class="part-title">{selectedPart?.name ?? 'Selected region'}</span>
      <button aria-label="Next part" title="Next part" onclick={onnext} disabled={partIndex < 0 || partIndex >= parts.length - 1}>›</button>
      <span class="dots">{#each parts as part, index}<span class:active={index === partIndex} title={part.name}></span>{/each}</span>
      <span class="divider"></span>
    {/if}
    <button aria-label="Side by side" title="Side by side" aria-pressed={mode === 'side-by-side'} onclick={() => mode = 'side-by-side'}>◫</button>
    <button aria-label="Stack vertically" title="Stack vertically" aria-pressed={mode === 'stacked'} onclick={() => mode = 'stacked'}>☷</button>
    <button aria-label="Overlay" title="Overlay" aria-pressed={mode === 'overlay'} onclick={() => mode = 'overlay'}>▣</button>
    {#if mode === 'overlay'}
      <span class="divider"></span>
      <button aria-label={playing ? 'Stop opacity animation' : 'Play opacity animation'} aria-pressed={playing} title={playing ? 'Stop' : 'Play'} onclick={play}>{playing ? '■' : '▷'}</button>
      <input type="range" min="0" max="1" step="0.01" bind:value={opacity} aria-label="Overlay opacity" oninput={stop} />
      <output>{Math.round(opacity * 100)}%</output>
    {/if}
  </nav>
  <div class="part-actions">
    {#if menuOpen}<div class="action-menu" role="menu" aria-label="Part actions" tabindex="-1" bind:this={menuElement} onkeydown={menuKeydown}>
      {#if onsave}<button role="menuitem" onclick={() => { menuOpen = false; onsave?.(); }}>Save part details</button>{/if}
      <button role="menuitem" onclick={onadjust}>Adjust region on whole image</button>
      <button role="menuitem" onclick={onnewregion}>Select a new region</button>
      <button role="menuitem" onclick={() => { menuOpen = false; onsavecomparison?.(); }}>Save comparison</button>
    </div>{/if}
    <button class="fab" bind:this={menuButton} aria-label={menuOpen ? 'Close part actions' : 'Open part actions'} aria-expanded={menuOpen} onclick={() => { menuOpen = !menuOpen; if (menuOpen) void tick().then(() => menuElement.querySelector('button')?.focus()); }}>{menuOpen ? '×' : '+'}</button>
  </div>
</section>

<svelte:window onpointerdown={(event) => { if (menuOpen && !(event.target as Element).closest('.part-actions')) menuOpen = false; }} />

<style>
  .parts-page { padding-bottom: 8rem; }
  .parts-heading { display: flex; justify-content: space-between; margin-bottom: 1.25rem; min-height: 5rem; }
  .back { align-self: start; }
  .title-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 25px #352b1b0a; margin: 0 auto; max-width: 560px; min-width: 0; padding: 1rem 1.4rem; position: relative; width: 100%; }
  .title-card h2 { font-size: 1.8rem; font-weight: 500; margin: 0; }
  .title-card > span { color: var(--muted); font-size: 0.8rem; position: absolute; right: 1.4rem; top: 1.3rem; }
  .title-card :global(.note) { color: var(--muted); font-size: 0.85rem; max-width: 80%; }
  button { background: #fff; border: 1px solid var(--border); border-radius: 12px; color: var(--text); cursor: pointer; min-height: 42px; padding: 0.5rem 0.75rem; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .back { border-radius: 999px; }
  .parts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin: auto; max-width: 1250px; }
  .parts-grid.stacked { grid-template-columns: 1fr; max-width: 850px; }
  .parts-grid.overlay { display: block; position: relative; }
  figure { background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 7px 22px #352b1b12; margin: 0; min-width: 0; overflow: hidden; padding: 7px; position: relative; }
  .overlay figure:last-child { background: transparent; border: 0; box-shadow: none; inset: 0; opacity: var(--opacity); pointer-events: none; position: absolute; }
  .overlay figure:last-child .chip { display: none; }
  canvas { background: #f7f6f3; border-radius: 9px; display: block; height: min(62vh, 680px); object-fit: contain; width: 100%; }
  .overlay figure:first-child canvas { height: min(54vh, 560px); }
  .overlay figure:last-child canvas { height: 100%; }
  .stacked canvas { height: min(38vh, 400px); }
  .chip { align-items: center; backdrop-filter: blur(8px); background: var(--surface-frost); border-radius: 50%; color: var(--accent); display: flex; font-size: 0.8rem; height: 24px; justify-content: center; left: 12px; position: absolute; top: 12px; width: 24px; z-index: 2; }
  .chip span { background: var(--tooltip); border-radius: 6px; color: var(--on-accent); display: none; font-size: 0.72rem; left: 32px; padding: 0.4rem; position: absolute; white-space: nowrap; }
  .chip:hover span, .chip:focus-visible span { display: block; }
  .part-dock { align-items: center; background: #fff; border: 1px solid var(--border); border-radius: 999px; bottom: calc(24px + env(safe-area-inset-bottom)); box-shadow: var(--shadow); display: flex; gap: 0.2rem; left: 50%; max-width: calc(100vw - 2rem); min-height: 64px; overflow-x: auto; padding: 0.35rem; position: fixed; transform: translateX(-50%); white-space: nowrap; z-index: 20; }
  .part-dock button { border: 0; font-size: 1.45rem; min-width: 2.8rem; }
  .part-dock button[aria-pressed='true'] { background: #eaf0ff; color: var(--accent); }
  .part-title { font-size: 0.78rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  .dots { display: flex; gap: 0.3rem; padding: 0 0.5rem; }
  .dots span { background: #d7dae1; border-radius: 50%; height: 0.5rem; width: 0.5rem; }
  .dots span.active { background: var(--accent); }
  .divider { background: var(--border); height: 1.8rem; margin: 0 0.4rem; width: 1px; }
  input { accent-color: var(--accent); width: 130px; }
  output { font-size: 0.8rem; padding-right: 0.5rem; }
  .part-actions { align-items: center; display: flex; gap: 0.7rem; position: fixed; right: max(24px, calc((100vw - 1500px) / 2)); top: 50%; transform: translateY(-50%); z-index: 21; }
  .fab { background: var(--accent); border: 0; border-radius: 50%; box-shadow: 0 6px 20px rgba(48,80,208,0.28); color: #fff; font-size: 2rem; height: 56px; width: 56px; }
  .action-menu { background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); display: grid; min-width: 260px; padding: 0.5rem; position: absolute; right: calc(100% + 12px); top: 50%; transform: translateY(-50%); }
  .action-menu button { border: 0; text-align: left; }
  .action-menu button:hover { background: #eaf0ff; color: var(--accent); }
  @media (min-width: 1100px) { .parts-grid { margin-left: 0; margin-right: 265px; max-width: none; } }
  @media (max-width: 1099px) { .part-actions { bottom: calc(112px + env(safe-area-inset-bottom)); right: 16px; top: auto; transform: none; } .action-menu { bottom: calc(100% + 12px); right: 0; top: auto; transform: none; } }
  @media (max-width: 719px) {
    .parts-heading { display: block; }
    .title-card { margin-top: 1rem; }
    .parts-grid { grid-template-columns: 1fr; }
    canvas { height: min(42vh, 450px); }
    .fab { height: 48px; width: 48px; }
    .part-dock { width: calc(100vw - 1rem); }
    .part-dock button { font-size: 1.15rem; min-width: 2.2rem; padding: 0.35rem; }
    .divider { margin: 0 0.15rem; }
    input { width: 55px; }
    output { padding-right: 0.2rem; }
  }
  @media (max-width: 479px) { .part-title { display: none; } }
</style>
