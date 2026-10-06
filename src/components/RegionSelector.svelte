<script lang="ts">
  import { untrack } from 'svelte';
  import type { Point } from '../lib/manualAnchors';
  import { regionFromPoints, type Region } from '../lib/region';
  import { createSampler, crosshairShades, DEFAULT_SHADES, type CrosshairShades, type Sampler } from '../lib/contrast';
  import Crosshair from './Crosshair.svelte';
  import Magnifier from './Magnifier.svelte';

  let { image, region = $bindable(null), savedRegions = [] }: {
    image: HTMLImageElement;
    region: Region | null;
    savedRegions?: Region[];
  } = $props();

  let surface: SVGSVGElement = $state()!;
  let start: Point | null = $state(null);
  let cursor = $state<Point>({ x: 0, y: 0 });
  let pointerId = $state<number | null>(null);
  let keyboard = $state(false);
  // Drawn pointer cursor: its centre is the exact point that a click or drag uses.
  let hover = $state<Point | null>(null);
  let shades = $state<CrosshairShades>(DEFAULT_SHADES);
  let imagePerScreen = $state(1);
  let sampler = $state.raw<Sampler | null>(null);
  let magnified = $derived(pointerId !== null || keyboard ? cursor : hover);

  $effect(() => {
    const current = image;
    sampler = null;
    if (current.complete) sampler = createSampler(current);
    untrack(() => cursor = { x: current.naturalWidth / 2, y: current.naturalHeight / 2 });
  });

  // Keep screen-sized overlays (labels, handles, crosshair) constant as the frame resizes.
  $effect(() => {
    const observer = new ResizeObserver(() => imagePerScreen = 1 / (surface.getScreenCTM()?.a || 1));
    observer.observe(surface);
    return () => observer.disconnect();
  });

  function local(event: PointerEvent): Point {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(surface.getScreenCTM()!.inverse());
  }

  function point(event: PointerEvent): Point {
    const p = local(event);
    return {
      x: Math.max(0, Math.min(image.naturalWidth, p.x)),
      y: Math.max(0, Math.min(image.naturalHeight, p.y))
    };
  }

  function inside(p: Point) {
    return p.x >= 0 && p.y >= 0 && p.x <= image.naturalWidth && p.y <= image.naturalHeight;
  }

  let shaded = false;
  function shadeAt(p: Point) {
    imagePerScreen = 1 / (surface.getScreenCTM()?.a || 1);
    shades = crosshairShades(sampler, p, imagePerScreen, shaded ? untrack(() => shades) : undefined);
    shaded = true;
  }

  function update(end: Point) {
    cursor = end;
    if (start) region = regionFromPoints(start, end, image.naturalWidth, image.naturalHeight);
  }

  function begin(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
    // Ignore the letterboxing around an object-fit image.
    if (!inside(local(event))) return;
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    keyboard = false;
    hover = null;
    start = point(event);
    cursor = start;
    shadeAt(cursor);
    region = null;
  }

  function move(event: PointerEvent) {
    if (event.pointerId === pointerId) {
      const p = point(event);
      update(p);
      shadeAt(p);
      if (event.pointerType === 'mouse') hover = p;
      return;
    }
    if (event.pointerType !== 'mouse') return;
    const p = local(event);
    hover = inside(p) ? p : null;
    if (hover) shadeAt(hover);
  }

  function finish(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    update(point(event));
    pointerId = null;
    start = null;
    if (event.pointerType !== 'mouse') hover = null;
    surface.releasePointerCapture(event.pointerId);
  }

  function cancel() {
    start = null;
    pointerId = null;
    hover = null;
    keyboard = false;
    region = null;
  }

  function keydown(event: KeyboardEvent) {
    if (pointerId !== null) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      keyboard = true;
      hover = null;
      if (start) {
        update(cursor);
        start = null;
      } else {
        start = { ...cursor };
        region = null;
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    keyboard = true;
    hover = null;
    const step = event.shiftKey ? 10 : 1;
    update({
      x: Math.max(0, Math.min(image.naturalWidth, cursor.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))),
      y: Math.max(0, Math.min(image.naturalHeight, cursor.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)))
    });
    shadeAt(cursor);
  }
</script>

<!-- This custom 2D selector implements keyboard interaction through its application role. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={surface}
  viewBox="0 0 {image.naturalWidth} {image.naturalHeight}"
  role="application"
  tabindex="0"
  aria-label="Select reference rectangle. Drag across the image, or use arrow keys to move, Enter to mark each corner, Shift for ten-pixel steps, and Escape to clear."
  style:cursor={hover ? 'none' : 'default'}
  onpointerdown={begin}
  onpointermove={move}
  onpointerleave={() => { if (pointerId === null) { hover = null; shaded = false; } }}
  onpointerup={finish}
  onpointercancel={cancel}
  onlostpointercapture={() => { if (pointerId !== null) cancel(); }}
  onkeydown={keydown}
  onblur={() => keyboard = false}
>
  <image href={image.src} width={image.naturalWidth} height={image.naturalHeight} />
  {#each savedRegions as saved, index}
    <g pointer-events="none" class="saved">
      <rect x={saved.x} y={saved.y} width={saved.width} height={saved.height} vector-effect="non-scaling-stroke" />
      <text x={saved.x} y={saved.y} dx={6 * imagePerScreen} dy={16 * imagePerScreen} font-size={12 * imagePerScreen}>{index + 1}</text>
    </g>
  {/each}
  {#if region}
    <path class="dim" fill-rule="evenodd" pointer-events="none"
      d="M0 0H{image.naturalWidth}V{image.naturalHeight}H0Z M{region.x} {region.y}V{region.y + region.height}H{region.x + region.width}V{region.y}Z" />
    <rect class="selection" x={region.x} y={region.y} width={region.width} height={region.height} vector-effect="non-scaling-stroke" pointer-events="none" />
    {#each [[region.x, region.y], [region.x + region.width, region.y], [region.x, region.y + region.height], [region.x + region.width, region.y + region.height]] as corner}
      <rect class="handle" x={corner[0] - 4 * imagePerScreen} y={corner[1] - 4 * imagePerScreen} width={8 * imagePerScreen} height={8 * imagePerScreen} vector-effect="non-scaling-stroke" pointer-events="none" />
    {/each}
  {/if}
  {#if pointerId !== null}
    <g transform="translate({cursor.x} {cursor.y}) scale({imagePerScreen})"><Crosshair {shades} /></g>
  {:else if hover}
    <g transform="translate({hover.x} {hover.y}) scale({imagePerScreen})"><Crosshair {shades} /></g>
  {:else if keyboard}
    <g transform="translate({cursor.x} {cursor.y}) scale({imagePerScreen})"><Crosshair {shades} emphasis /></g>
  {/if}
</svg>

{#if magnified}
  <Magnifier {image} point={magnified} {surface} {sampler} />
{/if}

<style>
  svg { background: var(--canvas-bg); display: block; height: var(--view-height, min(58vh, 650px)); touch-action: none; user-select: none; width: 100%; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  svg:focus:not(:focus-visible) { outline: none; }
  .saved rect { fill: rgba(48, 80, 208, 0.06); stroke: #3050d0; stroke-dasharray: 5 4; stroke-width: 1.5; }
  .saved text { fill: #3050d0; font-weight: 700; }
  .dim { fill: rgba(20, 22, 26, 0.16); }
  .selection { fill: none; stroke: #3050d0; stroke-dasharray: 6 4; stroke-width: 1.5; }
  .handle { fill: #fff; stroke: #3050d0; stroke-width: 1.5; }
</style>
