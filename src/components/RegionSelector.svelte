<script lang="ts">
  import type { Point } from '../lib/manualAnchors';
  import { regionFromPoints, type Region } from '../lib/region';

  let { image, region = $bindable(null) }: {
    image: HTMLImageElement;
    region: Region | null;
  } = $props();

  let surface: SVGSVGElement;
  let start: Point | null = $state(null);
  let cursor = $state<Point>({ x: 0, y: 0 });
  let pointerId: number | null = null;
  let keyboard = $state(false);

  function point(event: PointerEvent): Point {
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(surface.getScreenCTM()!.inverse());
    return {
      x: Math.max(0, Math.min(image.naturalWidth, local.x)),
      y: Math.max(0, Math.min(image.naturalHeight, local.y))
    };
  }

  function update(end: Point) {
    cursor = end;
    if (start) region = regionFromPoints(start, end, image.naturalWidth, image.naturalHeight);
  }

  function begin(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || pointerId !== null) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(surface.getScreenCTM()!.inverse());
    // Ignore the letterboxing around an object-fit image.
    if (local.x < 0 || local.y < 0 || local.x > image.naturalWidth || local.y > image.naturalHeight) return;
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    keyboard = false;
    start = point(event);
    cursor = start;
    region = null;
  }

  function finish(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    update(point(event));
    pointerId = null;
    start = null;
    surface.releasePointerCapture(event.pointerId);
  }

  function cancel() {
    start = null;
    pointerId = null;
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
    const step = event.shiftKey ? 10 : 1;
    update({
      x: Math.max(0, Math.min(image.naturalWidth, cursor.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))),
      y: Math.max(0, Math.min(image.naturalHeight, cursor.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)))
    });
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
  onpointerdown={begin}
  onpointermove={(event) => { if (event.pointerId === pointerId) update(point(event)); }}
  onpointerup={finish}
  onpointercancel={cancel}
  onlostpointercapture={() => { if (pointerId !== null) cancel(); }}
  onkeydown={keydown}
>
  <image href={image.src} width={image.naturalWidth} height={image.naturalHeight} />
  {#if region}
    <rect x={region.x} y={region.y} width={region.width} height={region.height} fill="#2563eb22" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke" />
  {/if}
  {#if keyboard}
    <path d="M {cursor.x - 8} {cursor.y} h 16 M {cursor.x} {cursor.y - 8} v 16" stroke="#e11d48" stroke-width="2" vector-effect="non-scaling-stroke" />
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: min(72vh, 820px); background: #f1f3f5; cursor: crosshair; touch-action: none; user-select: none; }
  svg:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
</style>
