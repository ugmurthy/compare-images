<script lang="ts">
  import type { AlignResult } from '../lib/opencv';
  import type { Region } from '../lib/region';
  import RegionSelector from './RegionSelector.svelte';

  let {
    refImg,
    srcImg,
    alignResult,
    diffImageData,
    viewMode,
    overlayOpacity,
    onrotatesource,
    sourceRotating = false,
    differenceProcessing = false,
    region = $bindable(null),
    oncompareparts
  }: {
    refImg: HTMLImageElement;
    srcImg: HTMLImageElement;
    alignResult: AlignResult | null;
    diffImageData: ImageData | null;
    viewMode: string;
    overlayOpacity: number;
    onrotatesource?: () => void;
    sourceRotating?: boolean;
    differenceProcessing?: boolean;
    region?: Region | null;
    oncompareparts?: () => void;
  } = $props();

  let refCanvas: HTMLCanvasElement = $state()!;
  let alignedCanvas: HTMLCanvasElement = $state()!;
  let diffCanvas: HTMLCanvasElement = $state()!;
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
    if (diffImageData && diffCanvas) {
      diffCanvas.width = diffImageData.width;
      diffCanvas.height = diffImageData.height;
      const ctx = diffCanvas.getContext('2d')!;
      ctx.putImageData(diffImageData, 0, 0);
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
  {#if alignResult && oncompareparts}
    <div class="parts-tools">
      <div>
        <strong>Compare a detail</strong>
        <p>{viewMode === 'overlay' ? 'Switch to Side by side or Difference to select a rectangle on the reference.' : 'Drag a rectangle on the reference. Keyboard: arrows to move, Enter for each corner, Escape to clear.'}</p>
        <span role="status">{region ? `Selected: ${region.width} × ${region.height} px at (${region.x}, ${region.y})` : 'No rectangle selected'}</span>
      </div>
      <button class="rotate-btn" onclick={() => region = null} disabled={!region}>Clear selection</button>
      <button class="parts-btn" aria-label="Compare parts" onclick={oncompareparts} disabled={!region}>Compare parts</button>
    </div>
  {/if}
  {#if viewMode === 'side-by-side'}
    <div class="view side-by-side">
      <div class="canvas-card">
        <span class="canvas-label">Reference</span>
        {#if alignResult && oncompareparts}
          <RegionSelector image={refImg} bind:region />
        {:else}
          <canvas bind:this={refCanvas}></canvas>
        {/if}
      </div>
      <div class="canvas-card">
        <div class="canvas-label with-action">
          <span>{alignResult ? 'Aligned Source' : 'Source'}</span>
          {#if onrotatesource}
            <button class="rotate-btn" onclick={onrotatesource} disabled={sourceRotating} aria-label="Rotate source image 90 degrees clockwise">
              <span aria-hidden="true">↻</span>
              {sourceRotating ? 'Rotating…' : 'Rotate 90°'}
            </button>
          {/if}
        </div>
        <canvas bind:this={alignedCanvas}></canvas>
      </div>
    </div>
  {:else if viewMode === 'overlay'}
    <div class="view overlay">
      <div class="canvas-card full-width">
        <span class="canvas-label">Overlay (opacity: {overlayOpacity.toFixed(2)})</span>
        <canvas bind:this={overlayCanvas}></canvas>
      </div>
    </div>
  {:else if viewMode === 'diff'}
    <div class="view diff">
      <div class="canvas-card">
        <span class="canvas-label">Reference</span>
        {#if alignResult && oncompareparts}
          <RegionSelector image={refImg} bind:region />
        {:else}
          <canvas bind:this={refCanvas}></canvas>
        {/if}
      </div>
      <div class="canvas-card" aria-busy={differenceProcessing}>
        <span class="canvas-label">Differences</span>
        <canvas bind:this={diffCanvas}></canvas>
        {#if differenceProcessing}
          <div class="processing-overlay" role="status" aria-live="polite">
            <span class="canvas-spinner" aria-hidden="true"></span>
            <span>Computing differences…</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .parts-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 0.65rem; margin-bottom: 0.85rem; font-size: 0.78rem; }
  .parts-tools > div { flex: 1 1 260px; }
  .parts-tools p { color: var(--muted); margin: 0.25rem 0; font-size: 0.73rem; }
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

  .side-by-side,
  .diff {
    grid-template-columns: 1fr 1fr;
  }

  .canvas-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    background: #ffffff;
  }

  .canvas-card.full-width {
    grid-column: 1 / -1;
  }

  .canvas-label {
    display: block;
    padding: 0.65rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    background: #fafafa;
  }

  .canvas-label.with-action {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

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
  .rotate-btn span { font-size: 1rem; line-height: 0.7; }

  .processing-overlay {
    align-items: center;
    background: rgba(255, 255, 255, 0.88);
    color: var(--muted);
    display: flex;
    flex-direction: column;
    font-size: 0.78rem;
    font-weight: 800;
    gap: 0.65rem;
    inset: 2.45rem 0 0;
    justify-content: center;
    position: absolute;
    z-index: 2;
  }

  .canvas-spinner {
    animation: spin 0.75s linear infinite;
    border: 3px solid #dce3eb;
    border-radius: 50%;
    border-top-color: var(--accent);
    height: 1.65rem;
    width: 1.65rem;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  canvas {
    width: 100%;
    height: min(72vh, 820px);
    display: block;
    background:
      linear-gradient(45deg, #eef0f3 25%, transparent 25%),
      linear-gradient(-45deg, #eef0f3 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #eef0f3 75%),
      linear-gradient(-45deg, transparent 75%, #eef0f3 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-size: 20px 20px;
    object-fit: contain;
  }

  @media (max-width: 820px) {
    .side-by-side,
    .diff {
      grid-template-columns: 1fr;
    }
  }
</style>
