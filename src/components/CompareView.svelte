<script lang="ts">
  import type { AlignResult } from '../lib/opencv';
  import type { Region } from '../lib/region';
  import RegionSelector from './RegionSelector.svelte';

  let {
    refImg,
    srcImg,
    alignResult,
    viewMode,
    overlayOpacity,
    referenceName = 'Reference',
    sourceName = 'Source',
    sourceRotations = 0,
    region = $bindable(null),
    savedRegions = [],
    oncompareparts
  }: {
    refImg: HTMLImageElement;
    srcImg: HTMLImageElement;
    alignResult: AlignResult | null;
    viewMode: string;
    overlayOpacity: number;
    referenceName?: string;
    sourceName?: string;
    sourceRotations?: number;
    region?: Region | null;
    savedRegions?: Region[];
    oncompareparts?: () => void;
  } = $props();

  let refCanvas: HTMLCanvasElement = $state()!;
  let alignedCanvas: HTMLCanvasElement = $state()!;
  let overlayCanvas: HTMLCanvasElement = $state()!;
  let cachedAlignResult: AlignResult | null = null;
  let cachedSource: HTMLImageElement | null = null;
  let cachedAlignedCanvas: HTMLCanvasElement | null = null;

  // Draw images to canvases after mount/update
  $effect(() => {
    if (refImg && refCanvas) {
      refCanvas.width = refImg.naturalWidth;
      refCanvas.height = refImg.naturalHeight;
      const ctx = refCanvas.getContext('2d')!;
      ctx.drawImage(refImg, 0, 0);

    }
  });

  $effect(() => {
    if (alignedCanvas) {
      const ctx = alignedCanvas.getContext('2d')!;
      if (alignResult) {
        alignedCanvas.width = alignResult.aligned.width;
        alignedCanvas.height = alignResult.aligned.height;
        ctx.putImageData(alignResult.aligned, 0, 0);
      } else if (srcImg) {
        alignedCanvas.width = srcImg.naturalWidth;
        alignedCanvas.height = srcImg.naturalHeight;
        ctx.drawImage(srcImg, 0, 0);
      }
    }
  });

  $effect(() => {
    if (refImg && srcImg && overlayCanvas) {
      const w = refImg.naturalWidth;
      const h = refImg.naturalHeight;
      if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
        overlayCanvas.width = w;
        overlayCanvas.height = h;
      }
      const ctx = overlayCanvas.getContext('2d')!;

      // Draw reference
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(refImg, 0, 0);

      // Draw aligned with opacity
      if (cachedAlignResult !== alignResult || cachedSource !== srcImg || !cachedAlignedCanvas) {
        cachedAlignResult = alignResult;
        cachedSource = srcImg;
        cachedAlignedCanvas = document.createElement('canvas');
        cachedAlignedCanvas.width = alignResult?.aligned.width ?? srcImg.naturalWidth;
        cachedAlignedCanvas.height = alignResult?.aligned.height ?? srcImg.naturalHeight;
        const alignedContext = cachedAlignedCanvas.getContext('2d')!;
        if (alignResult) alignedContext.putImageData(alignResult.aligned, 0, 0);
        else alignedContext.drawImage(srcImg, 0, 0);
      }
      ctx.globalAlpha = overlayOpacity;
      ctx.drawImage(cachedAlignedCanvas, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  });
</script>

<section class="compare-section">
  {#if viewMode === 'side-by-side' || viewMode === 'stacked'}
    <div class="view side-by-side" class:stacked={viewMode === 'stacked'}>
      <figure class="frame">
        <figcaption class="frame-caption">
          <span class="swatch reference" aria-hidden="true"></span><strong>Reference</strong>
          <span class="file" title={referenceName}>{referenceName}</span>
          {#if alignResult && oncompareparts}<span class="aside select-hint">{region ? 'Part selected' : 'Drag to select a part'}</span>{/if}
        </figcaption>
        <div class="canvas-wrap">
          {#if alignResult && oncompareparts}
            <RegionSelector image={refImg} bind:region {savedRegions} />
          {:else}
            <canvas bind:this={refCanvas} aria-label="Reference image"></canvas>
          {/if}
        </div>
      </figure>
      <figure class="frame">
        <figcaption class="frame-caption">
          <span class="swatch source" aria-hidden="true"></span><strong>Source</strong>
          <span class="file" title={sourceName}>{sourceName}</span>
          <span class="aside">{[alignResult ? 'Aligned' : '', sourceRotations ? `Rotated ${sourceRotations * 90}°` : ''].filter(Boolean).join(' · ')}</span>
        </figcaption>
        <div class="canvas-wrap"><canvas bind:this={alignedCanvas} aria-label="{alignResult ? 'Aligned source' : 'Source'} image"></canvas></div>
      </figure>
    </div>
  {:else if viewMode === 'overlay'}
    <div class="view overlay">
      <figure class="frame">
        <figcaption class="frame-caption">
          <span class="swatch reference" aria-hidden="true"></span><strong>Reference</strong>
          <span aria-hidden="true">+</span>
          <span class="swatch source" aria-hidden="true"></span><strong>Source</strong>
          <span class="file" title="{referenceName} + {sourceName}">{alignResult ? 'aligned overlay' : 'unaligned overlay'}</span>
          <span class="aside tabular">Source {Math.round(overlayOpacity * 100)}%</span>
        </figcaption>
        <div class="canvas-wrap"><canvas bind:this={overlayCanvas} aria-label="Overlay of reference and source"></canvas></div>
      </figure>
    </div>
  {/if}
</section>

<style>
  .view { display: grid; gap: 16px; }
  .side-by-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .side-by-side.stacked { grid-template-columns: 1fr; margin: 0 auto; max-width: 980px; width: 100%; }
  figure { margin: 0; }
  .canvas-wrap { background: var(--canvas-bg); padding: 8px; }
  .canvas-wrap :global(canvas), .canvas-wrap :global(svg) { --view-height: clamp(280px, calc(100dvh - 330px - var(--dock-space, 0px)), 900px); }
  .stacked .canvas-wrap :global(canvas), .stacked .canvas-wrap :global(svg) { --view-height: clamp(240px, 62vh, 700px); }
  canvas { display: block; height: var(--view-height); object-fit: contain; width: 100%; }
  .select-hint { color: var(--accent); font-weight: 500; }
  .tabular { font-variant-numeric: tabular-nums; }
  @media (max-width: 719px) {
    .canvas-wrap { padding: 4px; }
    /* Follow the image's own aspect ratio on phones instead of letterboxing a fixed height. */
    .view .canvas-wrap :global(canvas), .view .canvas-wrap :global(svg) { --view-height: auto; max-height: 64vh; }
  }
</style>
