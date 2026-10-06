<script lang="ts">
  import { untrack } from 'svelte';
  import type { ManualAnchor, Point } from '../lib/manualAnchors';
  import { createSampler, crosshairShades, type CrosshairShades, type Sampler } from '../lib/contrast';
  import Crosshair from './Crosshair.svelte';
  import Magnifier from './Magnifier.svelte';
  import Icon from './Icon.svelte';

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
    ontogglelist,
    onapply,
    oncancel,
    applying = false,
    canApply
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
    onapply: () => void;
    oncancel?: () => void;
    applying?: boolean;
    canApply: boolean;
  } = $props();

  let refFrame: HTMLDivElement = $state()!;
  let srcFrame: HTMLDivElement = $state()!;
  let dragState: {
    id: number | null;
    pointerId: number;
    target: HTMLElement;
    point: Point;
    side: 'ref' | 'src';
    pointerOffsetX: number;
    pointerOffsetY: number;
  } | null = $state(null);
  let keyboardPoint = $state<{ side: 'ref' | 'src'; point: Point } | null>(null);
  let lastActiveSide: 'ref' | 'src' = $state('ref');
  let gridVisible = $state(false);
  let gridLinked = $state(true);
  let gridSpacing = $state(24);
  let gridOpacity = $state(0.25);
  let refGridX = $state(0);
  let refGridY = $state(0);
  let srcGridX = $state(0);
  let srcGridY = $state(0);
  // Bumped on frame resize so marker positions and screen-sized crosshairs are recomputed.
  let layoutVersion = $state(0);
  let samplers = $state.raw<{ ref: Sampler | null; src: Sampler | null }>({ ref: null, src: null });
  let markerShades = $state<Record<string, CrosshairShades>>({});
  let hover = $state<{ side: 'ref' | 'src'; point: Point; left: number; top: number; shades: CrosshairShades } | null>(null);
  let magnified = $derived(dragState ?? hover ?? keyboardPoint);

  $effect(() => {
    samplers = { ref: refImg ? createSampler(refImg) : null, src: srcImg ? createSampler(srcImg) : null };
  });

  $effect(() => {
    const frames = [refFrame, srcFrame].filter(Boolean);
    if (!frames.length) return;
    const observer = new ResizeObserver(() => layoutVersion++);
    frames.forEach((frame) => observer.observe(frame));
    return () => observer.disconnect();
  });

  $effect(() => {
    layoutVersion;
    const next: Record<string, CrosshairShades> = {};
    for (const anchor of anchors) {
      for (const side of ['ref', 'src'] as const) {
        const point = anchor[side];
        if (!point) continue;
        const key = `${side}-${anchor.id}`;
        next[key] = crosshairShades(samplers[side], point, imagePerScreen(side), untrack(() => markerShades[key]));
      }
    }
    markerShades = next;
  });

  function imagePerScreen(side: 'ref' | 'src') {
    const placement = imagePlacement(side);
    return placement ? placement.img.naturalWidth / placement.renderedWidth : 1;
  }

  function handleFrameMove(event: PointerEvent, side: 'ref' | 'src') {
    keyboardPoint = null;
    handlePointerMove(event);
    if (dragState || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button')) {
      hover = null;
      return;
    }
    const placement = imagePlacement(side);
    if (!placement) return;
    const { rect, borderX, borderY, renderedWidth, renderedHeight, offsetX, offsetY, img } = placement;
    const left = event.clientX - rect.left - borderX;
    const top = event.clientY - rect.top - borderY;
    if (left < offsetX || top < offsetY || left > offsetX + renderedWidth || top > offsetY + renderedHeight) {
      hover = null;
      return;
    }
    // The same mapping as pointFromClient, so the drawn centre is exactly where a click places the anchor.
    const point = { x: ((left - offsetX) / renderedWidth) * img.naturalWidth, y: ((top - offsetY) / renderedHeight) * img.naturalHeight };
    const previous = hover?.side === side ? hover.shades : undefined;
    hover = { side, point, left, top, shades: crosshairShades(samplers[side], point, img.naturalWidth / renderedWidth, previous) };
  }

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
    const hues = [224, 12, 145, 278, 38, 186, 330, 92];
    return `hsl(${hues[(id - 1) % hues.length]} 68% 44%)`;
  }

  let pendingId = $derived(anchors.find((anchor) => !anchor.ref || !anchor.src)?.id ?? Math.max(0, ...anchors.map((anchor) => anchor.id)) + 1);

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
    if (count >= 4) return 'ready to apply';
    if (count > 0) return `${4 - count} more pair${4 - count === 1 ? '' : 's'} needed`;
    return 'at least 4 pairs needed';
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
    const border = getComputedStyle(frame);
    const width = rect.width - parseFloat(border.borderLeftWidth) - parseFloat(border.borderRightWidth);
    const height = rect.height - parseFloat(border.borderTopWidth) - parseFloat(border.borderBottomWidth);
    const frameRatio = width / height;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    let renderedWidth = width;
    let renderedHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (frameRatio > imageRatio) {
      renderedWidth = height * imageRatio;
      offsetX = (width - renderedWidth) / 2;
    } else {
      renderedHeight = width / imageRatio;
      offsetY = (height - renderedHeight) / 2;
    }

    return { rect, borderX: frame.clientLeft, borderY: frame.clientTop, renderedWidth, renderedHeight, offsetX, offsetY, img };
  }

  function pointFromClient(clientX: number, clientY: number, side: 'ref' | 'src'): Point | null {
    const placement = imagePlacement(side);
    if (!placement) return null;

    const { rect, borderX, borderY, renderedWidth, renderedHeight, offsetX, offsetY, img } = placement;
    const x = ((clientX - rect.left - borderX - offsetX) / renderedWidth) * img.naturalWidth;
    const y = ((clientY - rect.top - borderY - offsetY) / renderedHeight) * img.naturalHeight;

    return {
      x: clamp(x, 0, img.naturalWidth),
      y: clamp(y, 0, img.naturalHeight)
    };
  }

  function pointFromEvent(event: PointerEvent, side: 'ref' | 'src'): Point | null {
    return pointFromClient(event.clientX, event.clientY, side);
  }

  function displayPoint(point: Point, side: 'ref' | 'src') {
    layoutVersion;
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
    if (!event.isPrimary || event.button !== 0 || dragState) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const placement = imagePlacement(side);
    if (!placement) return;
    const { rect, borderX, borderY, offsetX, offsetY, renderedWidth, renderedHeight } = placement;
    const x = event.clientX - rect.left - borderX - offsetX;
    const y = event.clientY - rect.top - borderY - offsetY;
    if (x < 0 || y < 0 || x > renderedWidth || y > renderedHeight) return;
    const point = pointFromEvent(event, side);
    if (!point) return;
    lastActiveSide = side;
    hover = null;
    keyboardPoint = null;
    const target = event.currentTarget as HTMLElement;
    target.focus({ preventScroll: true });
    dragState = { id: null, pointerId: event.pointerId, target, point, side, pointerOffsetX: 0, pointerOffsetY: 0 };
    target.setPointerCapture(event.pointerId);
  }

  function handleAnchorPointerDown(event: PointerEvent, id: number, side: 'ref' | 'src') {
    if (!event.isPrimary || event.button !== 0 || dragState) return;
    event.preventDefault();
    event.stopPropagation();
    const point = anchors.find((anchor) => anchor.id === id)?.[side];
    if (!point) return;
    hover = null;
    keyboardPoint = null;
    lastActiveSide = side;
    onselect(id);
    const handle = event.currentTarget as HTMLElement;
    const rect = handle.getBoundingClientRect();
    dragState = {
      id,
      pointerId: event.pointerId,
      target: handle,
      point,
      side,
      pointerOffsetX: event.clientX - (rect.left + rect.width / 2),
      pointerOffsetY: event.clientY - (rect.top + rect.height / 2)
    };
    handle.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const point = pointFromClient(
      event.clientX - dragState.pointerOffsetX,
      event.clientY - dragState.pointerOffsetY,
      dragState.side
    );
    if (point) {
      dragState.point = point;
      if (dragState.id !== null) onmove(dragState.id, dragState.side, point);
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    handlePointerMove(event);
    const { id, side, point, target, pointerId } = dragState;
    dragState = null;
    if (id === null) onadd(side, point);
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  }

  function cancelPointer(event: PointerEvent) {
    if (dragState?.pointerId !== event.pointerId) return;
    const { target, pointerId } = dragState;
    dragState = null;
    hover = null;
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).matches('input, textarea, select')) return;
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
      const img = imageForSide(lastActiveSide)!;
      const next = {
        x: clamp(point.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), 0, img.naturalWidth),
        y: clamp(point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0), 0, img.naturalHeight)
      };
      onmove(selectedAnchorId, lastActiveSide, next);
      hover = null;
      keyboardPoint = { side: lastActiveSide, point: next };
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet canvas(side: 'ref' | 'src')}
  {@const img = side === 'ref' ? refImg : srcImg}
  {@const name = side === 'ref' ? 'Reference' : 'Source'}
  <figure class="frame">
    <figcaption class="frame-caption">
      <span class="swatch {side === 'ref' ? 'reference' : 'source'}" aria-hidden="true"></span><strong>{name}</strong>
      <span class="aside">{anchors.filter((anchor) => anchor[side]).length} points</span>
    </figcaption>
    <div class="canvas-wrap">
      {#if side === 'ref'}
        <div class="anchor-frame" bind:this={refFrame} style:cursor={hover?.side === side ? 'none' : 'default'} style:--ratio={img ? img.naturalWidth / img.naturalHeight : 4 / 3}
          onpointerdown={(event) => handleFramePointerDown(event, side)} onpointermove={(event) => handleFrameMove(event, side)}
          onpointerup={handlePointerUp} onpointercancel={cancelPointer} onlostpointercapture={cancelPointer}
          onpointerleave={() => hover = null} onfocusout={() => keyboardPoint = null} role="button" tabindex="0" aria-label="Reference anchor canvas">
          {@render layers(side, img)}
        </div>
      {:else}
        <div class="anchor-frame" bind:this={srcFrame} style:cursor={hover?.side === side ? 'none' : 'default'} style:--ratio={img ? img.naturalWidth / img.naturalHeight : 4 / 3}
          onpointerdown={(event) => handleFramePointerDown(event, side)} onpointermove={(event) => handleFrameMove(event, side)}
          onpointerup={handlePointerUp} onpointercancel={cancelPointer} onlostpointercapture={cancelPointer}
          onpointerleave={() => hover = null} onfocusout={() => keyboardPoint = null} role="button" tabindex="0" aria-label="Source anchor canvas">
          {@render layers(side, img)}
        </div>
      {/if}
    </div>
  </figure>
{/snippet}

{#snippet layers(side: 'ref' | 'src', img: HTMLImageElement | null)}
  {#if img}
    <img src={img.src} alt="{side === 'ref' ? 'Reference' : 'Source'} anchors" draggable="false" />
    {#if gridVisible}<span class="visual-grid" style={gridStyle(side)}></span>{/if}
    {#each anchors as anchor (anchor.id)}
      {@const point = anchor[side]}
      {#if point}
        {@const position = displayPoint(point, side)}
        <button
          class="anchor-handle"
          class:selected={selectedAnchorId === anchor.id}
          class:pending={!anchor.ref || !anchor.src}
          class:dragging={dragState?.id === anchor.id && dragState.side === side}
          style:--anchor-color={anchorColor(anchor.id)}
          style:left={position.left}
          style:top={position.top}
          onpointerdown={(event) => handleAnchorPointerDown(event, anchor.id, side)}
          aria-label="{side === 'ref' ? 'Reference' : 'Source'} anchor {anchor.id}"
        >
          <svg class="handle-cross" viewBox="-18 -18 36 36" aria-hidden="true"><Crosshair shades={markerShades[`${side}-${anchor.id}`]} emphasis={selectedAnchorId === anchor.id} /></svg>
          <span class="anchor-number">{anchor.id}</span>
        </button>
      {/if}
    {/each}
    {#if dragState?.side === side && dragState.id === null}
      {@const position = displayPoint(dragState.point, side)}
      <svg class="hover-cross" viewBox="-18 -18 36 36" style:left={position.left} style:top={position.top} aria-hidden="true"><Crosshair shades={crosshairShades(samplers[side], dragState.point, imagePerScreen(side))} /></svg>
    {:else if hover?.side === side}
      <svg class="hover-cross" viewBox="-18 -18 36 36" style:left="{hover.left}px" style:top="{hover.top}px" aria-hidden="true"><Crosshair shades={hover.shades} /></svg>
    {/if}
  {/if}
{/snippet}

<section class="anchor-editor">
  <div class="anchor-toolbar toolbar" role="toolbar" aria-label="Anchor tools">
    <div class="pair-progress" aria-live="polite">
      <span class="pair-meter" aria-hidden="true">{#each [0, 1, 2, 3] as index}<span class:done={completeCount > index}></span>{/each}</span>
      <span><strong>{completeCount}</strong> {completeCount === 1 ? 'pair' : 'pairs'} · {anchorQuality}</span>
    </div>
    <span class="tool-sep" aria-hidden="true"></span>
    <button class="btn icon" onclick={onundo} disabled={anchors.length === 0} aria-label="Undo" title="Undo last point">
      <Icon name="undo" />
    </button>
    <button class="btn icon" onclick={() => gridVisible = !gridVisible} aria-pressed={gridVisible} aria-label="Grid" title="Show a visual grid">
      <Icon name="grid" />
    </button>
    <button class="btn icon" onclick={ontogglelist} aria-pressed={listExpanded} aria-label="Point list" title="List all points">
      <Icon name="list" />
    </button>
    <button class="btn icon danger" onclick={onclear} disabled={anchors.length === 0} aria-label="Clear all" title="Remove all points">
      <Icon name="trash" />
    </button>
    <span class="tool-spacer"></span>
    {#if oncancel}<button class="btn quiet" title="Cancel anchors" onclick={oncancel}>Cancel</button>{/if}
    <span title={`Apply ${completeCount} paired anchors — at least four required`}>
      <button class="btn primary" aria-label="Apply manual alignment" onclick={onapply} disabled={!canApply}>
        <Icon name="check" /><span aria-hidden="true">{applying ? 'Aligning…' : 'Apply'}<span class="long-label">{' alignment'}</span></span>
      </button>
    </span>
  </div>

  <p class="placement-guide" aria-live="polite">
    <span class="pair-dot" style:--anchor-color={anchorColor(pendingId)} aria-hidden="true">{pendingId}</span>
    <span class="hint-text">{placementHint}</span>
    <span class="nudge-hint">Hold and move to place precisely · Drag markers to refine · Arrows nudge (Shift ×10) · Delete removes</span>
  </p>

  {#if gridVisible}
    <div class="grid-controls">
      <span class="control-title">Grid</span>
      <label>
        <span>Spacing</span>
        <input type="range" min="20" max="120" step="2" bind:value={gridSpacing} />
      </label>
      <label>
        <span>X position</span>
        <input type="range" min={-gridSpacing} max={gridSpacing} value={lastActiveSide === 'ref' ? refGridX : srcGridX}
          oninput={(event) => updateGridOffset('x', Number(event.currentTarget.value))} />
      </label>
      <label>
        <span>Y position</span>
        <input type="range" min={-gridSpacing} max={gridSpacing} value={lastActiveSide === 'ref' ? refGridY : srcGridY}
          oninput={(event) => updateGridOffset('y', Number(event.currentTarget.value))} />
      </label>
      <label>
        <span>Opacity</span>
        <input type="range" min="0.1" max="0.8" step="0.05" bind:value={gridOpacity} />
      </label>
      <div class="segmented" role="group" aria-label="Grid linking">
        <button aria-pressed={gridLinked} onclick={() => gridLinked = true}>Linked</button>
        <button aria-pressed={!gridLinked} onclick={() => gridLinked = false}>Independent</button>
      </div>
      {#if !gridLinked}
        <div class="segmented" role="group" aria-label="Grid to adjust">
          <button aria-pressed={lastActiveSide === 'ref'} onclick={() => lastActiveSide = 'ref'}>Reference</button>
          <button aria-pressed={lastActiveSide === 'src'} onclick={() => lastActiveSide = 'src'}>Source</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if listExpanded}
    <div class="anchor-list">
      {#if anchors.length === 0}
        <div class="empty-list">No anchor points yet. Click a feature on the reference to start.</div>
      {:else}
        <div class="anchor-row head" aria-hidden="true"><span>Point</span><span>Reference</span><span>Source</span><span></span></div>
        {#each anchors as anchor}
          <div class="anchor-row" class:selected={selectedAnchorId === anchor.id}>
            <button class="row-select" onclick={() => onselect(anchor.id)} aria-label="Select point {anchor.id}">
              <span class="row-dot" style:--anchor-color={anchorColor(anchor.id)}>{anchor.id}</span>
            </button>
            <span class:missing={!anchor.ref}>{anchor.ref ? `${anchor.ref.x.toFixed(0)}, ${anchor.ref.y.toFixed(0)}` : 'missing'}</span>
            <span class:missing={!anchor.src}>{anchor.src ? `${anchor.src.x.toFixed(0)}, ${anchor.src.y.toFixed(0)}` : 'missing'}</span>
            <button class="btn icon quiet danger" onclick={() => onremove(anchor.id)} aria-label="Remove point {anchor.id}" title="Remove point {anchor.id}"><Icon name="close" size={16} /></button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="anchor-workspace">
    {@render canvas('ref')}
    {@render canvas('src')}
  </div>

  {#if incompleteCount > 0}
    <p class="anchor-note">{incompleteCount} anchor{incompleteCount === 1 ? '' : 's'} still need a matching point.</p>
  {/if}
  {#if magnified && imageForSide(magnified.side)}
    <Magnifier image={imageForSide(magnified.side)!} point={magnified.point} surface={frameForSide(magnified.side)} sampler={samplers[magnified.side]} />
  {/if}
</section>

<style>
  .anchor-editor { display: flex; flex-direction: column; gap: 12px; }
  .anchor-toolbar { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 8px; position: sticky; top: calc(var(--app-bar-height) + 8px); z-index: 20; }
  .pair-progress { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.85rem; gap: 10px; padding: 0 6px; }
  .pair-progress strong { color: var(--ink); font-variant-numeric: tabular-nums; }
  .pair-meter { display: inline-flex; gap: 3px; }
  .pair-meter span { background: var(--hairline); border-radius: 999px; height: 6px; transition: background 160ms var(--ease); width: 14px; }
  .pair-meter span.done { background: var(--ok); }

  .placement-guide { align-items: center; color: var(--ink); display: grid; font-size: 0.875rem; gap: 4px 10px; grid-template-columns: auto 1fr auto; padding: 0 4px; }
  .pair-dot, .row-dot { align-items: center; background: var(--anchor-color); border-radius: 999px; color: #fff; display: inline-flex; flex: none; font-size: 0.7rem; font-weight: 700; height: 20px; justify-content: center; min-width: 20px; padding: 0 5px; }
  .nudge-hint { color: var(--ink-muted); font-size: 0.8rem; text-align: right; }

  .grid-controls { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 10px 14px; }
  .control-title { font-size: 0.85rem; font-weight: 600; }
  .grid-controls label { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.8rem; gap: 8px; }
  .grid-controls input[type="range"] { width: 100px; }
  .grid-controls .segmented > button { font-size: 0.8rem; min-height: 30px; }

  .anchor-list { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); display: grid; max-height: 280px; overflow: auto; }
  .anchor-row { align-items: center; border-bottom: 1px solid var(--hairline); display: grid; font-size: 0.82rem; font-variant-numeric: tabular-nums; gap: 12px; grid-template-columns: 56px 1fr 1fr 40px; padding: 2px 8px; }
  .anchor-row:last-child { border-bottom: 0; }
  .anchor-row.head { color: var(--ink-muted); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; min-height: 32px; text-transform: uppercase; }
  .anchor-row.selected { background: var(--accent-tint); }
  .row-select { background: transparent; border: 0; border-radius: 8px; cursor: pointer; display: flex; min-height: 40px; padding: 0 4px; align-items: center; }
  .missing { color: var(--danger); }
  .empty-list { color: var(--ink-muted); font-size: 0.85rem; padding: 14px; }

  .anchor-workspace { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .canvas-wrap { background: var(--canvas-bg); padding: 8px; }
  .anchor-frame { display: flex; height: clamp(280px, calc(100dvh - 330px), 860px); justify-content: center; overflow: hidden; position: relative; touch-action: none; }
  .anchor-frame:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .anchor-frame img { display: block; height: 100%; object-fit: contain; pointer-events: none; user-select: none; width: 100%; }
  .anchor-note { color: var(--ink-muted); font-size: 0.82rem; text-align: center; }

  .visual-grid {
    background-image:
      repeating-linear-gradient(to right, rgba(18, 37, 63, var(--grid-opacity)) 0 1px, transparent 1px var(--grid-size)),
      repeating-linear-gradient(to bottom, rgba(18, 37, 63, var(--grid-opacity)) 0 1px, transparent 1px var(--grid-size));
    background-position: var(--grid-x) var(--grid-y);
    inset: 0;
    pointer-events: none;
    position: absolute;
  }

  /* Marker: an open, adaptive crosshair centred on the exact point, plus an offset colour badge
     identifying the pair. Nothing is drawn over the point itself. */
  .anchor-handle { background: transparent; border: 0; border-radius: 50%; cursor: grab; height: 36px; padding: 0; position: absolute; transform: translate(-50%, -50%); width: 36px; }
  .anchor-handle.dragging { cursor: grabbing; }
  .anchor-handle:focus-visible { outline: 2px solid var(--anchor-color); outline-offset: 0; }
  .handle-cross, .hover-cross { display: block; height: 36px; overflow: visible; pointer-events: none; width: 36px; }
  .hover-cross { position: absolute; transform: translate(-50%, -50%); }
  .anchor-number {
    align-items: center;
    background: var(--anchor-color);
    border: 1.5px solid #fff;
    border-radius: 999px;
    box-shadow: 0 1px 3px rgba(20, 26, 35, 0.3);
    color: #fff;
    display: flex;
    font-size: 0.66rem;
    font-weight: 700;
    height: 18px;
    justify-content: center;
    line-height: 1;
    min-width: 18px;
    padding: 0 4px;
    pointer-events: none;
    position: absolute;
    right: -12px;
    top: -12px;
    transition: transform 160ms var(--ease);
  }
  .anchor-handle.selected .anchor-number { box-shadow: 0 0 0 3px color-mix(in srgb, var(--anchor-color) 35%, transparent), 0 1px 3px rgba(20, 26, 35, 0.3); transform: scale(1.15); }
  .anchor-handle.pending .anchor-number { animation: halo 1.6s ease-in-out infinite; }
  @keyframes halo { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--anchor-color) 30%, transparent); } }

  @media (max-width: 1180px) {
    .placement-guide { align-items: start; grid-template-columns: auto 1fr; }
    .nudge-hint { grid-column: 2; text-align: left; }
  }
  @media (max-width: 719px) {
    .anchor-toolbar { gap: 6px; padding: 6px; }
    .anchor-toolbar .tool-sep { display: none; }
    .pair-progress { order: -1; width: 100%; }
    .anchor-workspace { grid-template-columns: 1fr; }
    .anchor-frame { aspect-ratio: var(--ratio); height: auto; max-height: 60vh; }
    .long-label { display: none; }
    .canvas-wrap { padding: 4px; }
    .grid-controls label { justify-content: space-between; width: 100%; }
    .grid-controls input[type="range"] { flex: 1; max-width: 60%; }
  }
</style>
