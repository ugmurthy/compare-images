<script lang="ts">
  import { loadOpenCV, alignImages, computeDifference, detectGridAnchors } from './lib/opencv';
  import type { AlignResult } from './lib/opencv';
  import ImageDrop from './components/ImageDrop.svelte';
  import CompareView from './components/CompareView.svelte';

  // --- State (Svelte 5 runes) ---
  let refFile: File | null = $state(null);
  let srcFile: File | null = $state(null);
  let refUrl: string = $state('');
  let srcUrl: string = $state('');
  let refImg: HTMLImageElement | null = $state(null);
  let srcImg: HTMLImageElement | null = $state(null);
  let cvState: string = $state('idle'); // idle | loading | ready | error
  let processing: boolean = $state(false);
  let alignResult: AlignResult | null = $state(null);
  let diffImageData: ImageData | null = $state(null);
  let anchors: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] } | null = $state(null);
  let viewMode: string = $state('side-by-side'); // side-by-side | overlay | diff
  let overlayOpacity: number = $state(0.5);
  let statusMsg: string = $state('');
  let errorMsg: string = $state('');

  // --- Derived ---
  let canProcess = $derived(
    refImg !== null && srcImg !== null && cvState === 'ready' && !processing
  );

  // --- Handlers ---
  async function loadCv() {
    cvState = 'loading';
    statusMsg = 'Loading OpenCV.js… this may take a moment.';
    errorMsg = '';
    try {
      await loadOpenCV();
      cvState = 'ready';
      statusMsg = 'OpenCV.js loaded and ready.';
    } catch (e) {
      cvState = 'error';
      errorMsg = 'Failed to load OpenCV.js. Check your network connection.';
      console.error(e);
    }
  }

  function onRefSelected(file: File) {
    refFile = file;
    if (refUrl) URL.revokeObjectURL(refUrl);
    refUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { refImg = img; };
    img.src = refUrl;
    resetResults();
  }

  function onSrcSelected(file: File) {
    srcFile = file;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { srcImg = img; };
    img.src = srcUrl;
    resetResults();
  }

  function resetResults() {
    alignResult = null;
    diffImageData = null;
    anchors = null;
  }

  async function processImages() {
    if (!refImg || !srcImg || cvState !== 'ready') return;
    processing = true;
    errorMsg = '';
    statusMsg = 'Processing…';

    try {
      const cv = await loadOpenCV();

      // Draw images to canvases for OpenCV
      const refCanvas = drawImageToCanvas(refImg);
      const srcCanvas = drawImageToCanvas(srcImg);

      // Step 1: Detect grid anchors on reference
      try {
        anchors = detectGridAnchors(cv, refCanvas);
        if (anchors) {
          statusMsg = `Grid anchors found: TL(${anchors.tl[0].toFixed(0)},${anchors.tl[1].toFixed(0)}) TR(${anchors.tr[0].toFixed(0)},${anchors.tr[1].toFixed(0)}) BL(${anchors.bl[0].toFixed(0)},${anchors.bl[1].toFixed(0)}) BR(${anchors.br[0].toFixed(0)},${anchors.br[1].toFixed(0)})`;
        } else {
          statusMsg = 'No grid anchors detected — proceeding with feature-based alignment.';
        }
      } catch (e) {
        console.warn('Grid detection failed, continuing with feature alignment', e);
        statusMsg = 'Grid detection skipped — proceeding with feature-based alignment.';
      }

      // Step 2: Align source to reference
      statusMsg = 'Aligning images…';
      alignResult = alignImages(cv, refCanvas, srcCanvas);

      if (alignResult.inlierCount > 0) {
        statusMsg += ` | Aligned with ${alignResult.inlierCount} inlier matches.`;
      } else {
        statusMsg += ' | Alignment failed (not enough matches). Showing unaligned source.';
      }

      // Step 3: Compute difference
      statusMsg = 'Computing differences…';
      const alignedCanvas = imageDataToCanvas(alignResult.aligned);
      diffImageData = computeDifference(cv, refCanvas, alignedCanvas);

      statusMsg = `Done! ${alignResult.inlierCount} inlier matches. Select a view mode to inspect.`;
    } catch (e) {
      console.error(e);
      errorMsg = `Processing error: ${(e as Error).message}`;
    } finally {
      processing = false;
    }
  }

  // --- Utilities ---
  function drawImageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  function imageDataToCanvas(imgData: ImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
</script>

<header>
  <h1>✏️ Compare Sketch</h1>
  <p class="subtitle">Align &amp; compare pencil/charcoal sketch photographs</p>
</header>

<main>
  <section class="upload-section">
    <div class="upload-grid">
      <ImageDrop label="Reference Image" onselect={onRefSelected} />
      <ImageDrop label="Source Image (with changes)" onselect={onSrcSelected} />
    </div>

    <div class="preview-row">
      {#if refUrl}
        <div class="preview-card">
          <span class="preview-label">Reference</span>
          <img {refUrl} alt="Reference" />
        </div>
      {/if}
      {#if srcUrl}
        <div class="preview-card">
          <span class="preview-label">Source</span>
          <img {srcUrl} alt="Source" />
        </div>
      {/if}
    </div>
  </section>

  <section class="controls">
    {#if cvState === 'idle'}
      <button class="btn btn-primary" onclick={loadCv}>
        Load OpenCV.js
      </button>
    {:else if cvState === 'loading'}
      <button class="btn" disabled>Loading OpenCV.js…</button>
    {:else if cvState === 'error'}
      <button class="btn btn-danger" onclick={loadCv}>Retry Load OpenCV.js</button>
    {:else}
      <span class="badge badge-success">OpenCV Ready</span>

      <button class="btn btn-primary" onclick={processImages} disabled={!canProcess}>
        {#if processing}
          Processing…
        {:else}
          Align &amp; Compare
        {/if}
      </button>

      {#if alignResult}
        <div class="view-toggle">
          <button class="btn" class:active={viewMode === 'side-by-side'} onclick={() => viewMode = 'side-by-side'}>
            Side by Side
          </button>
          <button class="btn" class:active={viewMode === 'overlay'} onclick={() => viewMode = 'overlay'}>
            Overlay
          </button>
          <button class="btn" class:active={viewMode === 'diff'} onclick={() => viewMode = 'diff'}>
            Difference
          </button>
        </div>

        {#if viewMode === 'overlay'}
          <label class="slider-label">
            Opacity: {overlayOpacity.toFixed(2)}
            <input type="range" min="0" max="1" step="0.01" bind:value={overlayOpacity} />
          </label>
        {/if}
      {/if}
    {/if}
  </section>

  {#if statusMsg}
    <div class="status-bar" class:error={!!errorMsg}>
      {#if errorMsg}
        ❌ {errorMsg}
      {:else}
        ℹ️ {statusMsg}
      {/if}
    </div>
  {/if}

  {#if alignResult}
    <CompareView
      {refImg}
      {alignResult}
      {diffImageData}
      {viewMode}
      {overlayOpacity}
      {anchors}
    />
  {/if}
</main>

<style>
  header {
    padding: 1.5rem 2rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .subtitle {
    color: var(--muted);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .upload-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .preview-row {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }
  .preview-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
    flex: 1;
    min-width: 200px;
    max-width: 300px;
  }
  .preview-card img {
    width: 100%;
    display: block;
  }
  .preview-label {
    display: block;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .controls {
    margin-top: 2rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn:hover:not(:disabled) {
    background: var(--border);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .btn-danger {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }
  .btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .badge-success {
    background: var(--success);
    color: white;
  }

  .view-toggle {
    display: flex;
    gap: 0.25rem;
  }

  .slider-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .slider-label input[type="range"] {
    width: 100px;
  }

  .status-bar {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.825rem;
    color: var(--muted);
  }
  .status-bar.error {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
