<script lang="ts">
  import type { AlignResult } from '../lib/opencv';

  let {
    refImg,
    alignResult,
    diffImageData,
    viewMode,
    overlayOpacity,
    anchors
  }: {
    refImg: HTMLImageElement;
    alignResult: AlignResult;
    diffImageData: ImageData | null;
    viewMode: string;
    overlayOpacity: number;
    anchors: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } | null;
  } = $props();

  let refCanvas: HTMLCanvasElement = $state()!;
  let alignedCanvas: HTMLCanvasElement = $state()!;
  let diffCanvas: HTMLCanvasElement = $state()!;
  let overlayCanvas: HTMLCanvasElement = $state()!;

  // Draw images to canvases after mount/update
  $effect(() => {
    if (refImg && refCanvas) {
      refCanvas.width = refImg.naturalWidth;
      refCanvas.height = refImg.naturalHeight;
      const ctx = refCanvas.getContext('2d')!;
      ctx.drawImage(refImg, 0, 0);

      // Draw anchor markers
      if (anchors) {
        ctx.fillStyle = '#6366f1';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (const [key, pt] of Object.entries(anchors)) {
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(key.toUpperCase(), pt[0] + 12, pt[1] + 4);
          ctx.fillStyle = '#6366f1';
        }
      }
    }
  });

  $effect(() => {
    if (alignResult && alignedCanvas) {
      alignedCanvas.width = alignResult.aligned.width;
      alignedCanvas.height = alignResult.aligned.height;
      const ctx = alignedCanvas.getContext('2d')!;
      ctx.putImageData(alignResult.aligned, 0, 0);
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
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      const ctx = overlayCanvas.getContext('2d')!;

      // Draw reference
      ctx.drawImage(refImg, 0, 0);

      // Draw aligned with opacity
      ctx.globalAlpha = overlayOpacity;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = alignResult.aligned.width;
      tempCanvas.height = alignResult.aligned.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.putImageData(alignResult.aligned, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
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
        <span class="canvas-label">Aligned Source</span>
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
    margin-top: 2rem;
  }

  .view {
    display: grid;
    gap: 1rem;
  }

  .side-by-side,
  .diff {
    grid-template-columns: 1fr 1fr;
  }

  .canvas-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
  }

  .canvas-card.full-width {
    grid-column: 1 / -1;
  }

  .canvas-label {
    display: block;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  canvas {
    width: 100%;
    display: block;
    background: #000;
  }
</style>
