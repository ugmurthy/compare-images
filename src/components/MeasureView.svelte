<script lang="ts">
  import { onMount } from 'svelte';
  import type { Point } from '../lib/manualAnchors';
  import type { Region } from '../lib/region';
  import { measure, validCalibration, type Calibration } from '../lib/measurement';
  import { loadCalibration, saveCalibration } from '../lib/history';
  import Icon from './Icon.svelte';

  let { image, file, region = null, onback }: {
    image: HTMLImageElement;
    file: File;
    region?: Region | null;
    onback: () => void;
  } = $props();

  let calibration = $state<Calibration | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let notice = $state('');
  let calibrating = $state(false);
  let axes = $state('both');
  let points = $state<Point[]>([]);
  let horizontal = $state<number | undefined>();
  let vertical = $state<number | undefined>();
  let unit = $state('cm');
  let zoom = $state(1);
  let panning = $state(false);
  let surface: SVGSVGElement;
  let surfaceWidth = $state(1);
  let surfaceHeight = $state(1);
  let drag = $state<{ index: number; id: number; x: number; y: number } | null>(null);
  let cursor = $state<Point | null>(null);
  const guideMask = $props.id();
  const crosshair = 'M -18 0 H -5 M 5 0 H 18 M 0 -18 V -5 M 0 5 V 18 M 4 0 A 4 4 0 1 0 -4 0 A 4 4 0 1 0 4 0';
  const crosshairCursor = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="-20 -20 40 40"><path d="${crosshair}" fill="none" stroke="white" stroke-width="1"/></svg>`)}") 20 20, crosshair`;
  let bounds = $derived(calibrating || !region
    ? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight } : region);
  let scale = $derived(Math.min(surfaceWidth / bounds.width, surfaceHeight / bounds.height));
  let result = $derived(points.length === 2 && calibration && !calibrating
    ? measure(points as [Point, Point], calibration) : null);
  let candidate = $derived<Calibration | null>(points.length === 2 ? {
    points: [points[0], { x: axes === 'vertical' ? points[0].x : points[1].x, y: axes === 'horizontal' ? points[0].y : points[1].y }],
    horizontal: axes === 'vertical' ? null : horizontal ?? null,
    vertical: axes === 'horizontal' ? null : vertical ?? null, unit: unit.trim()
  } : null);
  let canSave = $derived(candidate && validCalibration(candidate, image.naturalWidth, image.naturalHeight)
    && (axes !== 'vertical' ? candidate.points[0].x !== candidate.points[1].x : true)
    && (axes !== 'horizontal' ? candidate.points[0].y !== candidate.points[1].y : true));

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      surfaceWidth = entry.contentRect.width;
      surfaceHeight = entry.contentRect.height;
    });
    observer.observe(surface);
    surface.focus();
    void loadCalibration(file).then((saved) => {
      calibration = saved;
      horizontal = saved?.horizontal ?? undefined;
      vertical = saved?.vertical ?? undefined;
      unit = saved?.unit || 'cm';
      calibrating = !saved;
    }).catch((cause) => error = `Could not load calibration: ${cause.message}`)
      .finally(() => loading = false);
    return () => observer.disconnect();
  });

  function clearPoints() {
    points = [];
    cursor = null;
    panning = false;
    notice = '';
  }

  function setScale() {
    clearPoints();
    axes = 'both';
    calibrating = true;
    zoom = 1;
  }

  async function save() {
    if (!candidate || !canSave || saving) return;
    saving = true;
    error = '';
    const saved = $state.snapshot(candidate);
    try {
      await saveCalibration(file, saved);
      calibration = saved;
      calibrating = false;
      clearPoints();
      notice = 'Calibration saved for this reference and all its parts.';
      zoom = 1;
      surface.focus();
    } catch (cause) { error = `Could not save calibration: ${(cause as Error).message}`; }
    finally { saving = false; }
  }

  function clamp(p: Point): Point {
    return { x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, p.x)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, p.y)) };
  }

  function eventPoint(event: PointerEvent): Point {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(surface.getScreenCTM()!.inverse());
  }

  function begin(event: PointerEvent) {
    if (loading || saving || !event.isPrimary || event.button !== 0 || drag) return;
    if (panning && zoom > 1) {
      drag = { index: -1, id: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      return;
    }
    const p = eventPoint(event);
    if (p.x < bounds.x || p.y < bounds.y || p.x > bounds.x + bounds.width || p.y > bounds.y + bounds.height) return;
    const handle = (event.target as Element).closest('[data-endpoint]');
    const index = handle ? Number(handle.getAttribute('data-endpoint')) : points.length;
    if (index > 1) return;
    if (!handle) points = [...points, { x: p.x, y: p.y }];
    surface.focus({ preventScroll: true });
    drag = { index, id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId);
    cursor = null;
    notice = '';
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.index === -1) {
      surface.parentElement!.scrollBy(drag.x - event.clientX, drag.y - event.clientY);
      drag.x = event.clientX;
      drag.y = event.clientY;
      return;
    }
    points = points.map((p, index) => index === drag!.index ? clamp(eventPoint(event)) : p);
  }

  function finish(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    move(event);
    drag = null;
    surface.releasePointerCapture(event.pointerId);
  }

  function keydown(event: KeyboardEvent, index?: number) {
    if (loading || saving) return;
    if (event.key === 'Escape') { event.preventDefault(); clearPoints(); return; }
    const p = index !== undefined ? points[index] : cursor ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 10 : 1;
      const next = clamp({ x: p.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        y: p.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) });
      if (index !== undefined) points = points.map((point, i) => i === index ? next : point);
      else cursor = next;
    } else if ((event.key === 'Enter' || event.key === ' ') && index === undefined) {
      event.preventDefault();
      if (points.length < 2) points = [...points, p];
      cursor = null;
    }
  }

  function format(n: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
  }
</script>

<section class="measure-page" aria-label="Measure reference">
  <header>
    <button class="icon-tool" aria-label="Back to comparison" title="Back to comparison" onclick={onback} disabled={saving}><Icon name="back" /></button>
    <div><h2>Measure {region ? 'part' : 'reference'}</h2><p>One reference scale · Measurements are not saved</p></div>
  </header>
  <div class="measure-layout">
    <div class="image-panel">
      <div class="image-tools">
        <span>{calibrating ? 'Calibrate on the full reference' : region ? 'Reference part' : 'Full reference'}</span>
        {#if zoom > 1}<button class="icon-tool" aria-label={panning ? 'Resume measuring' : 'Pan image'} title={panning ? 'Resume measuring' : 'Pan image'} aria-pressed={panning} onclick={() => panning = !panning}><Icon name={panning ? 'measure' : 'pan'} /></button>{/if}
        <label>Zoom <select bind:value={zoom}><option value={1}>Fit</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
      </div>
      <div class="image-scroll">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <svg bind:this={surface} viewBox="{bounds.x} {bounds.y} {bounds.width} {bounds.height}"
          style:width="{zoom * 100}%" style:height="calc(var(--image-height) * {zoom})" style:cursor={drag && drag.index >= 0 ? 'none' : panning && zoom > 1 ? 'grab' : crosshairCursor} role="application" tabindex="0"
          aria-label="Measurement image. Click two points. Arrow keys move the cursor, Enter places a point. Tab to endpoints and use arrows to refine. Shift moves ten pixels. Escape clears."
          onpointerdown={begin} onpointermove={move} onpointerup={finish}
          onpointercancel={() => drag = null} onlostpointercapture={() => drag = null} onkeydown={(event) => keydown(event)}>
          <image href={image.src} width={image.naturalWidth} height={image.naturalHeight} />
          {#if points.length === 2}
            <defs><mask id={guideMask} maskUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="white" />
              {#each points as p}<circle cx={p.x} cy={p.y} r={6 / scale} fill="black" />{/each}
            </mask></defs>
            <g mask="url(#{guideMask})" pointer-events="none">
              <path d="M {points[0].x} {points[0].y} H {points[1].x} V {points[1].y}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
              <path d="M {points[0].x} {points[0].y} H {points[1].x} V {points[1].y}" fill="none" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
            </g>
          {/if}
          {#each points as p, index}
            <g transform="translate({p.x} {p.y}) scale({1 / scale})" data-endpoint={index}
              role="button" tabindex="0" aria-label="Endpoint {index + 1}, x {format(p.x)}, y {format(p.y)}. Drag or use arrow keys."
              onkeydown={(event) => { event.stopPropagation(); keydown(event, index); }}>
              <circle r="22" fill="transparent" class="hit-target" style:cursor={drag?.index === index ? 'none' : 'grab'} />
              <path class="marker" d={crosshair} />
            </g>
          {/each}
          {#if cursor}
            <g transform="translate({cursor.x} {cursor.y}) scale({1 / scale})" pointer-events="none"><path class="marker" d={crosshair} /></g>
          {/if}
        </svg>
      </div>
    </div>
    <aside>
      {#if loading}<p role="status">Loading reference calibration…</p>
      {:else if calibrating}
        <h3>Set reference scale</h3>
        <p>Click opposite corners of a grid cell or rectangle. Use a larger span for more precise placement.</p>
        <label>Reference axes <select bind:value={axes}><option value="both">Horizontal and vertical</option><option value="horizontal">Horizontal only</option><option value="vertical">Vertical only</option></select></label>
        <fieldset><legend>Reference size on paper (optional)</legend>
          <p>Enter the size of the entire selected span, not one cell. Leave blank for percentages only.</p>
          {#if axes !== 'vertical'}<label>Horizontal size <input type="number" min="0.000001" step="any" bind:value={horizontal} placeholder="Percent only" /></label>{/if}
          {#if axes !== 'horizontal'}<label>Vertical size <input type="number" min="0.000001" step="any" bind:value={vertical} placeholder="Percent only" /></label>{/if}
          <label>Unit <input bind:value={unit} maxlength="20" placeholder="cm, inches, grid cells…" /></label>
        </fieldset>
        <p>{points.length === 0 ? 'Click the first reference point.' : points.length === 1 ? 'Click the second reference point.' : canSave ? 'Drag endpoints to refine, then save.' : 'Choose a nonzero span for each selected axis and positive paper sizes.'}</p>
        <div class="actions">
          <span title={saving ? 'Saving calibration…' : 'Save calibration'}><button class="primary icon-tool" aria-label="Save calibration" aria-busy={saving} onclick={save} disabled={!canSave || saving}><Icon name="save" /></button></span>
          <button class="icon-tool" aria-label="Start again" title="Start again — clear reference points" onclick={clearPoints} disabled={saving}><Icon name="undo" /></button>
          {#if calibration}<button class="icon-tool" aria-label="Cancel calibration" title="Cancel calibration — keep saved scale" onclick={() => { calibrating = false; clearPoints(); zoom = 1; }} disabled={saving}><Icon name="close" /></button>{/if}
        </div>
      {:else}
        <h3>Reference scale</h3>
        <p>Shared by the full reference and every part.</p>
        {#if calibration}
          <dl>
            <dt>Horizontal reference</dt><dd>{calibration.points[0].x === calibration.points[1].x ? 'Not calibrated' : calibration.horizontal === null ? '100%' : `${format(calibration.horizontal)} ${calibration.unit}`}</dd>
            <dt>Vertical reference</dt><dd>{calibration.points[0].y === calibration.points[1].y ? 'Not calibrated' : calibration.vertical === null ? '100%' : `${format(calibration.vertical)} ${calibration.unit}`}</dd>
          </dl>
        {/if}
        <button class="icon-tool" aria-label="Redo calibration" title="Redo calibration for the reference and all its parts" onclick={setScale}><Icon name="grid" /></button>
        <h3>Current measurement</h3>
        <p>{points.length === 0 ? 'Click the first feature point.' : points.length === 1 ? 'Click the second feature point.' : 'Drag endpoints to refine. Tab to a point for arrow-key nudging.'}</p>
        <div class="results" aria-live="polite">
          {#each ['horizontal', 'vertical'] as axis}
            {@const ratio = result?.[axis as 'horizontal' | 'vertical']}
            {@const size = calibration?.[axis as 'horizontal' | 'vertical']}
            <div><span>{axis === 'horizontal' ? 'Horizontal' : 'Vertical'}</span><strong>{ratio == null ? '—' : `${format(ratio * 100)}%`}</strong>
              {#if ratio != null && size != null}<span>{format(ratio * size)} {calibration?.unit}</span>{/if}
            </div>
          {/each}
        </div>
        <button class="icon-tool" aria-label="New measurement" title="New measurement — clear current points" onclick={clearPoints}><Icon name="plus" /></button>
        {#if !calibration}<button class="icon-tool" aria-label="Set calibration" title="Set reference calibration" onclick={setScale}><Icon name="grid" /></button>{/if}
      {/if}
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      {#if notice}<p role="status">{notice}</p>{/if}
    </aside>
  </div>
</section>

<style>
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  h2, h3 { margin: 0; }
  p { color: var(--muted); font-size: 0.85rem; line-height: 1.5; }
  header p { margin: 4px 0 0; }
  .measure-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
  .image-panel, aside { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 12px; min-width: 0; }
  .image-tools { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: center; font-size: 0.8rem; margin-bottom: 10px; }
  .image-tools label { display: flex; align-items: center; gap: 8px; margin: 0; }
  .image-scroll { overflow: auto; max-height: 62vh; border-radius: 8px; background: #f7f6f3; }
  svg { --image-height: 52vh; display: block; min-height: 240px; cursor: crosshair; touch-action: none; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .marker { fill: none; stroke: white; stroke-width: 1; pointer-events: none; }
  g[data-endpoint]:focus { outline: none; }
  g:focus-visible .marker { stroke-width: 2; }
  button, input, select { font: inherit; color: var(--text); background: var(--control-bg); border: 1px solid var(--border); border-radius: 8px; padding: 9px 10px; min-height: 44px; box-sizing: border-box; }
  button { cursor: pointer; }
  .icon-tool { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; flex-shrink: 0; }
  button:disabled { opacity: 0.5; cursor: default; }
  .primary { background: var(--accent); color: var(--on-accent); }
  label { display: grid; gap: 6px; margin: 12px 0; font-size: 0.85rem; }
  input, select { min-width: 0; width: 100%; }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin: 16px 0; }
  legend { font-size: 0.85rem; }
  fieldset p { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  dl { font-size: 0.85rem; }
  dt { color: var(--muted); }
  dd { margin: 4px 0 12px; }
  aside > h3:not(:first-child) { margin-top: 24px; }
  .results { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .results div { display: grid; gap: 6px; background: var(--control-bg); border-radius: 8px; padding: 12px; font-variant-numeric: tabular-nums; }
  .results span { font-size: 0.85rem; overflow-wrap: anywhere; }
  strong { font-size: 1.5rem; }
  .error { color: #c02942; }
  @media (max-width: 719px) {
    .measure-layout { grid-template-columns: 1fr; }
    .image-scroll { max-height: 48vh; }
    svg { --image-height: 42vh; }
    aside { padding: 16px; }
  }
</style>
