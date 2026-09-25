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
    region?: Region | null;
    savedRegions?: Region[];
    oncompareparts?: () => void;
  } = $props();

  let refCanvas: HTMLCanvasElement = $state()!;
  let alignedCanvas: HTMLCanvasElement = $state()!;
  let overlayCanvas: HTMLCanvasElement = $state()!;
  let cachedAlignResult: AlignResult | null = null;
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
    if (refImg && alignResult && overlayCanvas) {
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
      if (cachedAlignResult !== alignResult || !cachedAlignedCanvas) {
        cachedAlignResult = alignResult;
        cachedAlignedCanvas = document.createElement('canvas');
        cachedAlignedCanvas.width = alignResult.aligned.width;
        cachedAlignedCanvas.height = alignResult.aligned.height;
        cachedAlignedCanvas.getContext('2d')!.putImageData(alignResult.aligned, 0, 0);
      }
      ctx.globalAlpha = overlayOpacity;
      ctx.drawImage(cachedAlignedCanvas, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  });
</script>

<section class="compare-section">
  {#if alignResult && oncompareparts && viewMode !== 'overlay'}
    <div class="parts-tools">
      <span role="status">{region ? `Region selected · ${region.width} × ${region.height} px` : 'Drag on the reference to select a part'}</span>
      {#if region}
        <button class="rotate-btn" onclick={() => region = null}>Clear selection</button>
        <button class="parts-btn" aria-label="Compare parts" onclick={oncompareparts}>Compare parts</button>
      {/if}
    </div>
  {/if}
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
        <button type="button" class="canvas-label" title="{alignResult ? 'Aligned source' : 'Source'} · {sourceName}" aria-label="{alignResult ? 'Aligned source' : 'Source'} · {sourceName}">ⓘ<span class="identity">{sourceName}</span></button>
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
  .parts-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 0.65rem; margin-bottom: 0.85rem; font-size: 0.78rem; }
  .parts-tools span { color: var(--accent); font-size: 0.73rem; }
  .parts-tools button { min-height: 44px; }
  .parts-btn { background: var(--accent); border: 1px solid var(--accent); border-radius: 6px; color: #fff; cursor: pointer; font-size: 0.78rem; font-weight: 800; padding: 0.5rem 0.8rem; }
  .parts-btn:disabled { opacity: 0.5; cursor: not-allowed; }

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

  .canvas-label { align-items: center; background: #fffd; border: 0; border-radius: 50%; box-shadow: 0 2px 8px #0002; color: var(--accent); cursor: help; display: flex; font-size: 1rem; height: 2rem; justify-content: center; left: 1rem; position: absolute; top: 1rem; width: 2rem; z-index: 1; }
  .identity { background: #1e1f22e8; border-radius: 6px; color: #fff; display: none; font-size: 0.72rem; left: 2.4rem; max-width: min(220px, 60vw); overflow: hidden; padding: 0.4rem; position: absolute; text-overflow: ellipsis; white-space: nowrap; }
  .canvas-label:hover .identity, .canvas-label:focus-visible .identity { display: block; }

  .rotate-btn {
    align-items: center;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--accent);
    cursor: pointer;
    display: inline-flex;
    font-size: 0.7rem;
    font-weight: 800;
    gap: 0.3rem;
    letter-spacing: 0;
    padding: 0.3rem 0.5rem;
    text-transform: none;
  }

  .rotate-btn:hover { border-color: var(--accent); }
  .rotate-btn:disabled { cursor: wait; opacity: 0.55; }

  canvas {
    width: 100%;
    height: min(58vh, 650px);
    display: block;
    background: #f7f6f3;
    border-radius: 9px;
    object-fit: contain;
  }

  @media (max-width: 820px) {
    .side-by-side {
      grid-template-columns: 1fr;
    }
    canvas { height: min(48vh, 500px); }
    .parts-tools button { display: none; }
  }
</style>
