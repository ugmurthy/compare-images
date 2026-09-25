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
      <div class="canvas-card">
        <button type="button" class="canvas-label" title="Reference · {referenceName}" aria-label="Reference · {referenceName}">ⓘ<span class="identity">{referenceName}</span></button>
        {#if alignResult && oncompareparts}
          <RegionSelector image={refImg} bind:region {savedRegions} />
        {:else}
          <canvas bind:this={refCanvas}></canvas>
        {/if}
      </div>
      <div class="canvas-card">
        <button type="button" class="canvas-label" title="{sourceName} · rotated {sourceRotations * 90}°" aria-label="Source · {sourceName} · rotated {sourceRotations * 90}°">ⓘ<span class="identity">{sourceName} · rotated {sourceRotations * 90}°</span></button>
        <canvas bind:this={alignedCanvas}></canvas>
      </div>
    </div>
  {:else if viewMode === 'overlay'}
    <div class="view overlay">
      <div class="canvas-card full-width">
        <button type="button" class="canvas-label" title="Overlay · {referenceName} + {sourceName}" aria-label="Overlay · {referenceName} + {sourceName}">ⓘ<span class="identity">{referenceName} + {sourceName}</span></button>
        <canvas bind:this={overlayCanvas}></canvas>
      </div>
    </div>
  {/if}
</section>

<style>
  .compare-section {
    margin-top: 0;
  }

  .view {
    display: grid;
    gap: 0.9rem;
  }

  .side-by-side { grid-template-columns: 1fr 1fr; }
  .side-by-side.stacked { grid-template-columns: 1fr; max-width: 900px; margin: auto; }

  .canvas-card {
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    position: relative;
    background: #ffffff;
    box-shadow: 0 7px 22px #352b1b12;
    padding: 7px;
  }

  .canvas-card.full-width {
    grid-column: 1 / -1;
  }

  .canvas-label { align-items: center; backdrop-filter: blur(8px); background: var(--surface-frost); border: 0; border-radius: 50%; color: var(--accent); cursor: help; display: flex; font-size: 0.8rem; height: 24px; justify-content: center; left: 12px; position: absolute; top: 12px; width: 24px; z-index: 1; }
  .identity { background: var(--tooltip); border-radius: 6px; color: var(--on-accent); display: none; font-size: 0.72rem; left: 32px; max-width: min(220px, 60vw); overflow: hidden; padding: 0.4rem; position: absolute; text-overflow: ellipsis; white-space: nowrap; }
  .canvas-label:hover .identity, .canvas-label:focus-visible .identity { display: block; }

  canvas {
    width: 100%;
    height: min(58vh, 650px);
    display: block;
    background: #f7f6f3;
    border-radius: 9px;
    object-fit: contain;
  }

  @media (max-width: 719px) {
    .side-by-side {
      grid-template-columns: 1fr;
    }
    canvas { height: min(48vh, 500px); }
  }
</style>
