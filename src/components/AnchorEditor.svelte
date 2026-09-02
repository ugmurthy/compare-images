<script lang="ts">
  import type { ManualAnchor, Point } from '../lib/manualAnchors';

  let {
    refImg,
    srcImg,
    anchors,
    selectedAnchorId,
    listExpanded,
    onadd,
    onmove,
    onremove,
    onclear,
    onundo,
    onselect,
    ontogglelist
  }: {
    refImg: HTMLImageElement | null;
    srcImg: HTMLImageElement | null;
    anchors: ManualAnchor[];
    selectedAnchorId: number | null;
    listExpanded: boolean;
    onadd: (side: 'ref' | 'src', point: Point) => void;
    onmove: (id: number, side: 'ref' | 'src', point: Point) => void;
    onremove: (id: number) => void;
    onclear: () => void;
    onundo: () => void;
    onselect: (id: number | null) => void;
    ontogglelist: () => void;
  } = $props();

  let refFrame: HTMLDivElement = $state()!;
  let srcFrame: HTMLDivElement = $state()!;
  let dragState: {
    id: number;
    side: 'ref' | 'src';
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null = $state(null);
  let lastActiveSide: 'ref' | 'src' = $state('ref');
  let gridVisible = $state(false);
  let gridLinked = $state(true);
  let gridSpacing = $state(48);
  let gridOpacity = $state(0.32);
  let refGridX = $state(0);
  let refGridY = $state(0);
  let srcGridX = $state(0);
  let srcGridY = $state(0);

  let completeCount = $derived(anchors.filter((anchor) => anchor.ref && anchor.src).length);
  let incompleteCount = $derived(anchors.length - completeCount);
  let anchorQuality = $derived(getAnchorQuality(completeCount));
  let placementHint = $derived(getPlacementHint());

  function getPlacementHint(): string {
    const pending = anchors.find((anchor) => !anchor.ref || !anchor.src);
    if (!pending) return `Click Reference to place point ${anchors.length + 1}, then click the same location on Source.`;
    if (!pending.ref) return `Point ${pending.id}: click its location on Reference.`;
    return `Point ${pending.id}: now click the matching location on Source.`;
  }

  function anchorColor(id: number): string {
    const hues = [214, 16, 145, 278, 42, 184, 330, 92];
    return `hsl(${hues[(id - 1) % hues.length]} 72% 45%)`;
  }

  function gridStyle(side: 'ref' | 'src'): string {
    const x = side === 'ref' ? refGridX : srcGridX;
    const y = side === 'ref' ? refGridY : srcGridY;
    return `--grid-size:${gridSpacing}px;--grid-x:${x}px;--grid-y:${y}px;--grid-opacity:${gridOpacity}`;
  }

  function updateGridOffset(axis: 'x' | 'y', value: number) {
    if (lastActiveSide === 'ref') {
      if (axis === 'x') refGridX = value;
      else refGridY = value;
      if (gridLinked) {
        if (axis === 'x') srcGridX = value;
        else srcGridY = value;
      }
    } else {
      if (axis === 'x') srcGridX = value;
      else srcGridY = value;
      if (gridLinked) {
        if (axis === 'x') refGridX = value;
        else refGridY = value;
      }
    }
  }

  function getAnchorQuality(count: number): string {
    if (count >= 8) return 'strong manual alignment';
    if (count >= 4) return 'manual homography ready';
    if (count > 0) return `${4 - count} more pair${4 - count === 1 ? '' : 's'} needed`;
    return 'auto alignment will be used';
  }

  function frameForSide(side: 'ref' | 'src'): HTMLDivElement {
    return side === 'ref' ? refFrame : srcFrame;
  }

  function imageForSide(side: 'ref' | 'src'): HTMLImageElement | null {
    return side === 'ref' ? refImg : srcImg;
  }

  function imagePlacement(side: 'ref' | 'src') {
    const frame = frameForSide(side);
    const img = imageForSide(side);
    if (!frame || !img) return null;

    const rect = frame.getBoundingClientRect();
    const frameRatio = rect.width / rect.height;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    let renderedWidth = rect.width;
    let renderedHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (frameRatio > imageRatio) {
      renderedWidth = rect.height * imageRatio;
      offsetX = (rect.width - renderedWidth) / 2;
    } else {
      renderedHeight = rect.width / imageRatio;
      offsetY = (rect.height - renderedHeight) / 2;
    }

    return { rect, renderedWidth, renderedHeight, offsetX, offsetY, img };
  }

  function pointFromClient(clientX: number, clientY: number, side: 'ref' | 'src'): Point | null {
    const placement = imagePlacement(side);
    if (!placement) return null;

    const { rect, renderedWidth, renderedHeight, offsetX, offsetY, img } = placement;
    const x = ((clientX - rect.left - offsetX) / renderedWidth) * img.naturalWidth;
    const y = ((clientY - rect.top - offsetY) / renderedHeight) * img.naturalHeight;

    return {
      x: clamp(x, 0, img.naturalWidth),
      y: clamp(y, 0, img.naturalHeight)
    };
  }

  function pointFromEvent(event: PointerEvent, side: 'ref' | 'src'): Point | null {
    return pointFromClient(event.clientX, event.clientY, side);
  }

  function displayPoint(point: Point, side: 'ref' | 'src') {
    const placement = imagePlacement(side);
    if (!placement) {
      const img = imageForSide(side);
      if (!img) return { left: '0px', top: '0px' };
      return {
        left: `${(point.x / img.naturalWidth) * 100}%`,
        top: `${(point.y / img.naturalHeight) * 100}%`
      };
    }

    const { renderedWidth, renderedHeight, offsetX, offsetY, img } = placement;
    return {
      left: `${offsetX + (point.x / img.naturalWidth) * renderedWidth}px`,
      top: `${offsetY + (point.y / img.naturalHeight) * renderedHeight}px`
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function handleFramePointerDown(event: PointerEvent, side: 'ref' | 'src') {
    if ((event.target as HTMLElement).closest('button')) return;
    const point = pointFromEvent(event, side);
    if (!point) return;
    lastActiveSide = side;
    onadd(side, point);
  }

  function handleAnchorPointerDown(event: PointerEvent, id: number, side: 'ref' | 'src') {
    event.preventDefault();
    event.stopPropagation();
    lastActiveSide = side;
    onselect(id);
    const handle = event.currentTarget as HTMLElement;
    const rect = handle.getBoundingClientRect();
    dragState = {
      id,
      side,
      pointerOffsetX: event.clientX - (rect.left + rect.width / 2),
      pointerOffsetY: event.clientY - (rect.top + rect.height / 2)
    };
    handle.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragState) return;
    const point = pointFromClient(
      event.clientX - dragState.pointerOffsetX,
      event.clientY - dragState.pointerOffsetY,
      dragState.side
    );
    if (point) onmove(dragState.id, dragState.side, point);
  }

  function handlePointerUp() {
    dragState = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnchorId !== null) {
      event.preventDefault();
      onremove(selectedAnchorId);
      return;
    }

    if (selectedAnchorId !== null && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const selected = anchors.find((anchor) => anchor.id === selectedAnchorId);
      const point = selected?.[lastActiveSide];
      if (!point) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      onmove(selectedAnchorId, lastActiveSide, {
        x: point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        y: point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      });
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="anchor-editor">
  <div class="anchor-toolbar">
    <div>
      <h2>Place matching points</h2>
      <p>{anchors.length} anchors · {completeCount} paired · {anchorQuality}</p>
    </div>
    <div class="toolbar-actions">
      <button class="anchor-btn" class:active={gridVisible} onclick={() => gridVisible = !gridVisible} aria-pressed={gridVisible}>
        Grid
      </button>
      <button class="anchor-btn" onclick={ontogglelist}>
        {listExpanded ? 'Hide points' : 'Point list'}
      </button>
      <button class="anchor-btn" onclick={onundo} disabled={anchors.length === 0}>
        Undo
      </button>
      <button class="anchor-btn danger" onclick={onclear} disabled={anchors.length === 0}>
        Clear All
      </button>
    </div>
  </div>

  <div class="placement-guide">
    <span class="guide-crosshair" aria-hidden="true"></span>
    <span>{placementHint}</span>
    <span class="nudge-hint">Drag to refine · Arrow keys nudge</span>
  </div>

  {#if gridVisible}
    <div class="grid-controls">
      <span class="control-title">Grid</span>
      <label>
        <span>Spacing</span>
        <input type="range" min="20" max="120" step="2" bind:value={gridSpacing} />
      </label>
      <label>
        <span>X position</span>
        <input
          type="range"
          min={-gridSpacing}
          max={gridSpacing}
          value={lastActiveSide === 'ref' ? refGridX : srcGridX}
          oninput={(event) => updateGridOffset('x', Number(event.currentTarget.value))}
        />
      </label>
      <label>
        <span>Y position</span>
        <input
          type="range"
          min={-gridSpacing}
          max={gridSpacing}
          value={lastActiveSide === 'ref' ? refGridY : srcGridY}
          oninput={(event) => updateGridOffset('y', Number(event.currentTarget.value))}
        />
      </label>
      <label>
        <span>Opacity</span>
        <input type="range" min="0.1" max="0.8" step="0.05" bind:value={gridOpacity} />
      </label>
      <button class="link-grid" class:active={gridLinked} onclick={() => gridLinked = !gridLinked} aria-pressed={gridLinked}>
        {gridLinked ? 'Linked grids' : 'Independent grids'}
      </button>
      {#if !gridLinked}
        <div class="grid-side" aria-label="Grid to adjust">
          <button class:active={lastActiveSide === 'ref'} onclick={() => lastActiveSide = 'ref'}>Reference</button>
          <button class:active={lastActiveSide === 'src'} onclick={() => lastActiveSide = 'src'}>Source</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="anchor-workspace">
    <div class="anchor-image">
      <span class="image-label">Reference</span>
      <div
        class="anchor-frame"
        bind:this={refFrame}
        onpointerdown={(event) => handleFramePointerDown(event, 'ref')}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        role="button"
        tabindex="0"
        aria-label="Reference anchor canvas"
      >
        {#if refImg}
          <img src={refImg.src} alt="Reference anchors" draggable="false" />
          {#if gridVisible}<span class="visual-grid" style={gridStyle('ref')}></span>{/if}
          {#each anchors as anchor}
            {#if anchor.ref}
              <button
                class="anchor-handle reference"
                class:selected={selectedAnchorId === anchor.id}
                style:--anchor-color={anchorColor(anchor.id)}
                style:left={displayPoint(anchor.ref, 'ref').left}
                style:top={displayPoint(anchor.ref, 'ref').top}
                onpointerdown={(event) => handleAnchorPointerDown(event, anchor.id, 'ref')}
                aria-label="Reference anchor {anchor.id}"
              >
                <span class="anchor-number">{anchor.id}</span>
              </button>
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <div class="anchor-image">
      <span class="image-label">Source</span>
      <div
        class="anchor-frame"
        bind:this={srcFrame}
        onpointerdown={(event) => handleFramePointerDown(event, 'src')}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        role="button"
        tabindex="0"
        aria-label="Source anchor canvas"
      >
        {#if srcImg}
          <img src={srcImg.src} alt="Source anchors" draggable="false" />
          {#if gridVisible}<span class="visual-grid" style={gridStyle('src')}></span>{/if}
          {#each anchors as anchor}
            {#if anchor.src}
              <button
                class="anchor-handle source"
                class:selected={selectedAnchorId === anchor.id}
                style:--anchor-color={anchorColor(anchor.id)}
                style:left={displayPoint(anchor.src, 'src').left}
                style:top={displayPoint(anchor.src, 'src').top}
                onpointerdown={(event) => handleAnchorPointerDown(event, anchor.id, 'src')}
                aria-label="Source anchor {anchor.id}"
              >
                <span class="anchor-number">{anchor.id}</span>
              </button>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>

  {#if incompleteCount > 0}
    <p class="anchor-note">{incompleteCount} anchor{incompleteCount === 1 ? '' : 's'} still need a matching point.</p>
  {/if}

  {#if listExpanded}
    <div class="anchor-list">
      {#if anchors.length === 0}
        <div class="empty-list">No manual anchors yet.</div>
      {:else}
        {#each anchors as anchor}
          <button
            class="anchor-row"
            class:selected={selectedAnchorId === anchor.id}
            onclick={() => onselect(anchor.id)}
          >
            <span>Point {anchor.id}</span>
            <span>{anchor.ref ? `${anchor.ref.x.toFixed(0)}, ${anchor.ref.y.toFixed(0)}` : 'ref missing'}</span>
            <span>{anchor.src ? `${anchor.src.x.toFixed(0)}, ${anchor.src.y.toFixed(0)}` : 'source missing'}</span>
            <span
              class="remove-anchor"
              role="button"
              tabindex="0"
              onclick={(event) => {
                event.stopPropagation();
                onremove(anchor.id);
              }}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onremove(anchor.id);
                }
              }}
            >
              Remove
            </span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .anchor-editor {
    display: grid;
    gap: 1rem;
  }

  .anchor-toolbar,
  .toolbar-actions,
  .anchor-workspace {
    display: flex;
  }

  .anchor-toolbar {
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--text);
    font-size: 1rem;
    font-weight: 800;
  }

  .anchor-toolbar p,
  .anchor-note {
    color: var(--muted);
    font-size: 0.84rem;
    margin-top: 0.2rem;
  }

  .toolbar-actions {
    gap: 0.5rem;
  }

  .anchor-btn {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 800;
    min-height: 2.25rem;
    padding: 0.45rem 0.75rem;
  }

  .anchor-btn.active,
  .link-grid.active {
    background: var(--accent-soft);
    border-color: rgba(36, 107, 254, 0.35);
    color: var(--accent);
  }

  .anchor-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .anchor-btn.danger {
    color: var(--danger);
  }

  .anchor-workspace {
    gap: 1rem;
  }

  .placement-guide {
    align-items: center;
    background: #eef5ff;
    border: 1px solid #c9dcff;
    border-radius: 7px;
    color: #24456f;
    display: flex;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.65rem;
    padding: 0.65rem 0.75rem;
  }

  .guide-crosshair {
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    height: 0.8rem;
    position: relative;
    width: 0.8rem;
  }

  .guide-crosshair::before,
  .guide-crosshair::after {
    background: var(--accent);
    content: '';
    left: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .guide-crosshair::before { height: 1px; width: 1.15rem; }
  .guide-crosshair::after { height: 1.15rem; width: 1px; }

  .nudge-hint {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 600;
    margin-left: auto;
  }

  .grid-controls {
    align-items: center;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    padding: 0.65rem 0.75rem;
  }

  .control-title {
    color: var(--text);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .grid-controls label {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-size: 0.72rem;
    font-weight: 700;
    gap: 0.4rem;
  }

  .grid-controls input[type="range"] {
    accent-color: var(--accent);
    width: 88px;
  }

  .link-grid {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 800;
    margin-left: auto;
    padding: 0.4rem 0.6rem;
  }

  .grid-side {
    background: var(--control-bg);
    border-radius: 6px;
    display: flex;
    padding: 0.15rem;
  }

  .grid-side button {
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 800;
    padding: 0.32rem 0.45rem;
  }

  .grid-side button.active {
    background: #fff;
    box-shadow: 0 1px 3px rgba(20, 26, 35, 0.14);
    color: var(--text);
  }

  .anchor-image {
    flex: 1;
    min-width: 0;
  }

  .image-label {
    color: var(--muted);
    display: block;
    font-size: 0.75rem;
    font-weight: 800;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
  }

  .anchor-frame {
    align-items: center;
    aspect-ratio: 4 / 3;
    background:
      linear-gradient(45deg, #f0f2f5 25%, transparent 25%),
      linear-gradient(-45deg, #f0f2f5 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #f0f2f5 75%),
      linear-gradient(-45deg, transparent 75%, #f0f2f5 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-size: 20px 20px;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: crosshair;
    display: flex;
    justify-content: center;
    overflow: hidden;
    position: relative;
    touch-action: none;
  }

  .anchor-frame img {
    display: block;
    height: 100%;
    max-width: 100%;
    object-fit: contain;
    pointer-events: none;
    width: 100%;
  }

  .visual-grid {
    background-image:
      repeating-linear-gradient(to right, rgba(18, 37, 63, var(--grid-opacity)) 0 1px, transparent 1px var(--grid-size)),
      repeating-linear-gradient(to bottom, rgba(18, 37, 63, var(--grid-opacity)) 0 1px, transparent 1px var(--grid-size));
    background-position: var(--grid-x) var(--grid-y);
    inset: 0;
    pointer-events: none;
    position: absolute;
  }

  .anchor-handle {
    --anchor-color: var(--accent);
    --crosshair-color: var(--anchor-color);
    background:
      linear-gradient(var(--crosshair-color), var(--crosshair-color)) left center / calc(50% - 4px) 1.5px no-repeat,
      linear-gradient(var(--crosshair-color), var(--crosshair-color)) right center / calc(50% - 4px) 1.5px no-repeat,
      linear-gradient(var(--crosshair-color), var(--crosshair-color)) center top / 1.5px calc(50% - 4px) no-repeat,
      linear-gradient(var(--crosshair-color), var(--crosshair-color)) center bottom / 1.5px calc(50% - 4px) no-repeat;
    border: 0;
    cursor: grab;
    filter: drop-shadow(0 1px 1px rgba(20, 26, 35, 0.35));
    height: 2rem;
    min-width: 2rem;
    padding: 0;
    pointer-events: auto;
    position: absolute;
    transform: translate(-50%, -50%);
    width: 2rem;
  }

  .anchor-handle.selected {
    --crosshair-color: var(--danger);
    filter:
      drop-shadow(0 0 0 rgba(200, 50, 50, 0.18))
      drop-shadow(0 1px 1px rgba(20, 26, 35, 0.35));
  }

  .anchor-number {
    align-items: center;
    background: var(--anchor-color);
    border: 1px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(20, 26, 35, 0.22);
    color: #ffffff;
    display: flex;
    font-size: 0.66rem;
    font-weight: 800;
    height: 1.1rem;
    justify-content: center;
    line-height: 1;
    min-width: 1.25rem;
    padding: 0 0.2rem;
    pointer-events: none;
    position: absolute;
    right: -0.75rem;
    top: -0.75rem;
  }

  .anchor-number:hover {
    cursor: grab;
  }

  .anchor-handle:active .anchor-number {
    cursor: grabbing;
  }

  .anchor-list {
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    max-height: 15rem;
    overflow: auto;
  }

  .anchor-row {
    align-items: center;
    background: #ffffff;
    border: 0;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    display: grid;
    font-size: 0.8rem;
    gap: 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 0.65rem 0.75rem;
    text-align: left;
  }

  .anchor-row:last-child {
    border-bottom: 0;
  }

  .anchor-row.selected {
    background: #f4f8ff;
    color: var(--text);
  }

  .anchor-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove-anchor {
    color: var(--danger);
    font-weight: 800;
    justify-self: end;
  }

  .empty-list {
    color: var(--muted);
    font-size: 0.84rem;
    padding: 0.8rem;
  }

  @media (max-width: 820px) {
    .anchor-toolbar,
    .anchor-workspace {
      flex-direction: column;
    }

    .toolbar-actions,
    .anchor-btn {
      width: 100%;
    }

    .anchor-row {
      display: grid;
      grid-template-columns: 1fr;
    }

    .placement-guide {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .nudge-hint {
      margin-left: 1.45rem;
      width: 100%;
    }

    .grid-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .grid-controls label {
      justify-content: space-between;
    }

    .grid-controls input[type="range"],
    .link-grid {
      margin-left: 0;
      width: 60%;
    }
  }
</style>
