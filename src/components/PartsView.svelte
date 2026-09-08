<script lang="ts">
  import { onMount } from 'svelte';
  import type { Region } from '../lib/region';

  let { reference, aligned, region, onback }: {
    reference: HTMLImageElement;
    aligned: ImageData;
    region: Region;
    onback: () => void;
  } = $props();

  let stacked = $state(true);
  let heading: HTMLHeadingElement;
  let referenceCanvas: HTMLCanvasElement;
  let sourceCanvas: HTMLCanvasElement;

  onMount(() => heading.focus());

  $effect(() => {
    if (!referenceCanvas || !sourceCanvas) return;
    const { x, y, width, height } = region;
    referenceCanvas.width = sourceCanvas.width = width;
    referenceCanvas.height = sourceCanvas.height = height;
    referenceCanvas.getContext('2d')!.drawImage(reference, x, y, width, height, 0, 0, width, height);
    // Write only the selected pixels; no full-size intermediate canvas is needed.
    sourceCanvas.getContext('2d')!.putImageData(aligned, -x, -y, x, y, width, height);
  });
</script>

<section class="parts-page" aria-label="Compare parts">
  <div class="toolbar">
    <button onclick={onback}>← Back to comparison</button>
    <div class="layout-tools" aria-label="Parts layout">
      <button aria-label="Stack vertically" title="Stack vertically" aria-pressed={stacked} onclick={() => stacked = true}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="18" height="7" rx="1" /></svg>
      </button>
      <button aria-label="Place side by side" title="Place side by side" aria-pressed={!stacked} onclick={() => stacked = false}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
      </button>
    </div>
  </div>
  <h2 bind:this={heading} tabindex="-1">Compare parts</h2>
  <p>Same aligned region · {region.width} × {region.height} px · position ({region.x}, {region.y})</p>
  <div class="parts-grid" class:stacked>
    <figure>
      <figcaption>Reference</figcaption>
      <canvas bind:this={referenceCanvas} aria-label="Selected reference region"></canvas>
    </figure>
    <figure>
      <figcaption>Aligned source</figcaption>
      <canvas bind:this={sourceCanvas} aria-label="Corresponding aligned source region"></canvas>
    </figure>
  </div>
</section>

<style>
  .parts-page { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }
  .layout-tools { display: flex; gap: 0.3rem; }
  button { background: #fff; border: 1px solid var(--border); border-radius: 6px; color: var(--accent); cursor: pointer; font-weight: 800; min-height: 44px; padding: 0.5rem 0.65rem; }
  button[aria-pressed='true'] { background: #eaf1ff; border-color: var(--accent); }
  button svg { display: block; width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  h2 { font-size: 1.15rem; margin: 0; }
  p { color: var(--muted); font-size: 0.78rem; margin: 0.35rem 0 1rem; }
  .parts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; }
  .parts-grid.stacked { grid-template-columns: minmax(0, 1fr); }
  figure { margin: 0; min-width: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  figcaption { padding: 0.65rem 0.75rem; background: #fafafa; border-bottom: 1px solid var(--border); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--muted); }
  canvas { display: block; width: 100%; height: min(65vh, 650px); object-fit: contain; background: #f1f3f5; }
  .stacked canvas { height: min(35vh, 400px); }
  @media (max-width: 540px) {
    .parts-page { padding: 0.65rem; }
    .parts-grid { gap: 0.4rem; }
    button { font-size: 0.72rem; }
    figcaption { padding: 0.5rem; font-size: 0.68rem; }
  }
</style>
