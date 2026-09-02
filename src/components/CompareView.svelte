<script lang="ts">
  import type { AlignResult } from '../lib/opencv';

  let {
    refImg,
    srcImg,
    alignResult,
    diffImageData,
    viewMode,
    overlayOpacity
  }: {
    refImg: HTMLImageElement;
    srcImg: HTMLImageElement;
    alignResult: AlignResult | null;
    diffImageData: ImageData | null;
    viewMode: string;
    overlayOpacity: number;
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
  {#if viewMode === 'side-by-side'}
    <div class="view side-by-side">
      <div class="canvas-card">
        <span class="canvas-label">Reference</span>
        <canvas bind:this={refCanvas}></canvas>
      </div>
      <div class="canvas-card">
        <span class="canvas-label">{alignResult ? 'Aligned Source' : 'Source'}</span>
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
        <canvas bind:this={refCanvas}></canvas>
      </div>
      <div class="canvas-card">
        <span class="canvas-label">Differences</span>
        <canvas bind:this={diffCanvas}></canvas>
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

  .side-by-side,
  .diff {
    grid-template-columns: 1fr 1fr;
  }

  .canvas-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
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
