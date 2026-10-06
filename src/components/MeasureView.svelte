<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Point } from '../lib/manualAnchors';
  import type { Region } from '../lib/region';
  import { measure, validCalibration, type Calibration } from '../lib/measurement';
  import { loadCalibration, saveCalibration } from '../lib/history';
  import { createSampler, crosshairShades, DEFAULT_SHADES, type CrosshairShades, type Sampler } from '../lib/contrast';
  import Crosshair from './Crosshair.svelte';
  import Magnifier from './Magnifier.svelte';
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
  let surface: SVGSVGElement = $state()!;
  let surfaceWidth = $state(1);
  let surfaceHeight = $state(1);
  let drag = $state<{ index: number; id: number; x: number; y: number } | null>(null);
  let cursor = $state<Point | null>(null);
  let nudged = $state<Point | null>(null);
  let magnified = $derived(drag ? drag.index >= 0 ? points[drag.index] : null : cursor ?? nudged);
  let sampler = $state.raw<Sampler | null>(null);
  let pointShades = $state<(CrosshairShades | undefined)[]>([]);
  let cursorShades = $state<CrosshairShades>(DEFAULT_SHADES);
  const guideMask = $props.id();
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
    sampler = createSampler(image);
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

  // Each arm and the centre ring pick black or white from the pixels beneath them, at the current zoom.
  let cursorShown = false;
  $effect(() => {
    const imagePerScreen = 1 / scale;
    pointShades = points.map((p, index) => crosshairShades(sampler, p, imagePerScreen, untrack(() => pointShades[index])));
    if (cursor) cursorShades = crosshairShades(sampler, cursor, imagePerScreen, cursorShown ? untrack(() => cursorShades) : undefined);
    cursorShown = !!cursor;
  });

  function legLabel(ratio: number | null, size: number | null | undefined) {
    if (ratio == null) return '';
    return size == null ? `${format(ratio * 100)}%` : `${format(ratio * size)} ${calibration?.unit ?? ''}`.trim();
  }

  async function centerZoom() {
    cursor = null;
    nudged = null;
    await tick();
    const viewport = surface.parentElement!;
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
  }

  function clearPoints() {
    points = [];
    cursor = null;
    nudged = null;
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
    nudged = null;
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
    nudged = null;
    if (!drag) {
      cursor = null;
      if (event.pointerType !== 'mouse' || loading || saving || (panning && zoom > 1)
        || (event.target as Element).closest('[data-endpoint]')) return;
      const p = eventPoint(event);
      if (p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height) cursor = p;
      return;
    }
    if (event.pointerId !== drag.id) return;
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
      if (index !== undefined) {
        points = points.map((point, i) => i === index ? next : point);
        cursor = null;
        nudged = next;
      }
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
  <header class="measure-head">
    <button class="btn quiet back" aria-label="Back to comparison" title="Back" onclick={onback} disabled={saving}><Icon name="back" /><span>Back</span></button>
    <div>
      <h2>Measure {region ? 'part' : 'reference'}</h2>
      <p>Calibrate once on a grid or known span, then measure horizontal and vertical distances between features.</p>
    </div>
  </header>
  <div class="measure-layout">
    <div class="image-panel frame">
      <div class="image-tools">
        <span class="chip" class:accent={calibrating}>{#if calibrating}<span class="dot"></span>Calibrating · full reference{:else}{region ? 'Reference part' : 'Full reference'}{/if}</span>
        <span class="step-hint" aria-live="polite">
          {#if loading}Loading…
          {:else if calibrating}{points.length === 0 ? 'Click the first corner of a known span' : points.length === 1 ? 'Click the opposite corner' : 'Drag the markers to refine, then save the scale'}
          {:else}{points.length === 0 ? 'Click the first feature' : points.length === 1 ? 'Click the second feature' : 'Drag a marker to refine · Esc clears'}{/if}
        </span>
        <span class="tool-spacer"></span>
        {#if zoom > 1}<button class="btn icon" aria-label={panning ? 'Resume measuring' : 'Pan image'} title={panning ? 'Resume measuring' : 'Pan image'} aria-pressed={panning} onclick={() => { panning = !panning; cursor = null; }}><Icon name="pan" /></button>{/if}
        <label class="zoom">Zoom <select bind:value={zoom} onchange={centerZoom}><option value={1}>Fit</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
      </div>
      <div class="image-scroll" onscroll={() => cursor = null}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <svg bind:this={surface} viewBox="{bounds.x} {bounds.y} {bounds.width} {bounds.height}"
          style:width="{zoom * 100}%" style:height="calc(var(--image-height) * {zoom})" style:cursor={panning && zoom > 1 ? 'grab' : 'none'} role="application" tabindex="0"
          aria-label="Measurement image. Click two points. Arrow keys move the cursor, Enter places a point. Tab to endpoints and use arrows to refine. Shift moves ten pixels. Escape clears."
          onpointerdown={begin} onpointermove={move} onpointerup={finish}
          onpointerleave={() => cursor = null}
          onpointercancel={() => drag = null} onlostpointercapture={() => drag = null}
          onfocusout={() => { nudged = null; cursor = null; }} onkeydown={(event) => keydown(event)}>
          {#snippet legTag(x: number, y: number, dx: number, dy: number, text: string, anchor: 'middle' | 'start' | 'end')}
            {@const width = text.length * 6.7 + 16}
            {@const left = anchor === 'middle' ? -width / 2 : anchor === 'start' ? 0 : -width}
            <g class="leg-tag" transform="translate({x} {y}) scale({1 / scale}) translate({dx} {dy})">
              <rect x={left} y="-10" width={width} height="20" rx="10" />
              <text x={left + width / 2} y="4" text-anchor="middle">{text}</text>
            </g>
          {/snippet}
          <!-- Clip to the measurable bounds: a part's neighbouring pixels would otherwise fill the letterbox but ignore clicks. -->
          <defs><clipPath id="{guideMask}-clip"><rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} /></clipPath></defs>
          <image href={image.src} width={image.naturalWidth} height={image.naturalHeight} clip-path="url(#{guideMask}-clip)" />
          {#if points.length === 2}
            <defs><mask id={guideMask} maskUnits="userSpaceOnUse" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="white" />
              {#each points as p}<circle cx={p.x} cy={p.y} r={6 / scale} fill="black" />{/each}
            </mask></defs>
            <g mask="url(#{guideMask})" pointer-events="none">
              <path d="M {points[0].x} {points[0].y} H {points[1].x} V {points[1].y}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
              <path d="M {points[0].x} {points[0].y} H {points[1].x} V {points[1].y}" fill="none" stroke="#3050d0" stroke-width="1.25" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
            </g>
            {#if result}
              <g pointer-events="none" aria-hidden="true">
                {#if result.horizontal && points[0].x !== points[1].x}
                  {@render legTag((points[0].x + points[1].x) / 2, points[0].y, 0, points[1].y >= points[0].y ? -16 : 16, `↔ ${legLabel(result.horizontal, calibration?.horizontal)}`, 'middle')}
                {/if}
                {#if result.vertical && points[0].y !== points[1].y}
                  {@render legTag(points[1].x, (points[0].y + points[1].y) / 2, points[1].x >= points[0].x ? 12 : -12, 0, `↕ ${legLabel(result.vertical, calibration?.vertical)}`, points[1].x >= points[0].x ? 'start' : 'end')}
                {/if}
              </g>
            {/if}
          {/if}
          {#each points as p, index}
            <g transform="translate({p.x} {p.y}) scale({1 / scale})" data-endpoint={index}
              role="button" tabindex="0" aria-label="Endpoint {index + 1}, x {format(p.x)}, y {format(p.y)}. Drag or use arrow keys."
              onkeydown={(event) => { event.stopPropagation(); keydown(event, index); }}>
              <circle r="22" fill="transparent" class="hit-target" style:cursor={drag?.index === index ? 'none' : 'grab'} />
              <Crosshair shades={pointShades[index]} emphasis={drag?.index === index} />
            </g>
          {/each}
          {#if cursor}
            <g class="placement-cursor" transform="translate({cursor.x} {cursor.y}) scale({1 / scale})" pointer-events="none"><Crosshair shades={cursorShades} /></g>
          {/if}
        </svg>
      </div>
    </div>
    <aside class="measure-panel">
      {#if loading}<p role="status" class="muted">Loading reference calibration…</p>
      {:else if calibrating}
        <section class="panel-card">
          <h3><span class="step-badge">1</span>Set the reference scale</h3>
          <ol class="steps">
            <li class:done={points.length >= 1} class:current={points.length === 0}>Click one corner of a grid cell or rectangle</li>
            <li class:done={points.length >= 2} class:current={points.length === 1}>Click the opposite corner</li>
            <li class:current={points.length === 2}>Optionally enter its real size, then save</li>
          </ol>
          <p class="muted small">A larger span gives more precise results.</p>
          <label>Reference axes <select bind:value={axes}><option value="both">Horizontal and vertical</option><option value="horizontal">Horizontal only</option><option value="vertical">Vertical only</option></select></label>
          <fieldset><legend>Size on paper <span class="muted">(optional)</span></legend>
            <p class="muted small">The size of the whole selected span, not one cell. Leave blank for percentages only.</p>
            <div class="size-fields">
              {#if axes !== 'vertical'}<label>Horizontal <input type="number" min="0.000001" step="any" bind:value={horizontal} placeholder="Percent only" /></label>{/if}
              {#if axes !== 'horizontal'}<label>Vertical <input type="number" min="0.000001" step="any" bind:value={vertical} placeholder="Percent only" /></label>{/if}
            </div>
            <label>Unit <input bind:value={unit} maxlength="20" placeholder="cm, inches, grid cells…" /></label>
          </fieldset>
          {#if points.length === 2 && !canSave}<p class="warn small">Choose a nonzero span for each selected axis and positive paper sizes.</p>{/if}
          <div class="actions">
            <span title={saving ? 'Saving calibration…' : 'Save calibration'}><button class="btn primary" aria-label="Save calibration" aria-busy={saving} onclick={save} disabled={!canSave || saving}><Icon name="save" /><span aria-hidden="true">{saving ? 'Saving…' : 'Save scale'}</span></button></span>
            <button class="btn" aria-label="Start again" title="Start again — clear reference points" onclick={clearPoints} disabled={saving}><Icon name="undo" /><span aria-hidden="true">Start again</span></button>
            {#if calibration}<button class="btn quiet" aria-label="Cancel calibration" title="Cancel calibration — keep saved scale" onclick={() => { calibrating = false; clearPoints(); zoom = 1; }} disabled={saving}><span aria-hidden="true">Cancel</span></button>{/if}
          </div>
        </section>
      {:else}
        <section class="panel-card scale-card">
          <div class="card-head">
            <h3><span class="step-badge done"><Icon name="check" size={12} /></span>Reference scale</h3>
            <button class="btn quiet" aria-label="Redo calibration" title="Redo calibration for the reference and all its parts" onclick={setScale}><Icon name="grid" /><span aria-hidden="true">Redo</span></button>
          </div>
          {#if calibration}
            <dl>
              <div><dt><Icon name="horizontal" size={14} />Horizontal</dt><dd>{calibration.points[0].x === calibration.points[1].x ? 'Not calibrated' : calibration.horizontal === null ? '100% span' : `${format(calibration.horizontal)} ${calibration.unit}`}</dd></div>
              <div><dt><Icon name="vertical" size={14} />Vertical</dt><dd>{calibration.points[0].y === calibration.points[1].y ? 'Not calibrated' : calibration.vertical === null ? '100% span' : `${format(calibration.vertical)} ${calibration.unit}`}</dd></div>
            </dl>
          {:else}
            <p class="muted small">No scale yet — distances can't be measured until you set one.</p>
            <button class="btn primary" aria-label="Set calibration" title="Set reference calibration" onclick={setScale}><Icon name="grid" /><span aria-hidden="true">Set scale</span></button>
          {/if}
          <p class="muted small">Shared by the full reference and every part.</p>
        </section>
        <section class="panel-card">
          <div class="card-head">
            <h3><span class="step-badge">2</span>Measure</h3>
            <button class="btn quiet" aria-label="New measurement" title="New measurement — clear current points" onclick={clearPoints} disabled={points.length === 0}><Icon name="plus" /><span aria-hidden="true">New</span></button>
          </div>
          <div class="point-steps" aria-hidden="true">
            <span class:done={points.length >= 1}>Point 1</span><span class="line" class:done={points.length >= 2}></span><span class:done={points.length >= 2}>Point 2</span>
          </div>
          <p class="muted small">{points.length === 0 ? 'Click the first feature point on the image.' : points.length === 1 ? 'Click the second feature point.' : 'Drag endpoints to refine. Tab to a point for arrow-key nudging.'}</p>
          <div class="results" aria-live="polite">
            {#each ['horizontal', 'vertical'] as axis}
              {@const ratio = result?.[axis as 'horizontal' | 'vertical']}
              {@const size = calibration?.[axis as 'horizontal' | 'vertical']}
              <div>
                <span class="axis"><Icon name={axis} size={14} />{axis === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
                <strong>{ratio == null ? '—' : `${format(ratio * 100)}%`}</strong>
                {#if ratio != null && size != null}<span class="absolute">{format(ratio * size)} {calibration?.unit}</span>{/if}
              </div>
            {/each}
          </div>
          <p class="muted small">Percentages are of the calibrated span. Zoom never changes distances; measurements aren't saved.</p>
        </section>
      {/if}
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      {#if notice}<p role="status" class="notice"><Icon name="check" size={14} />{notice}</p>{/if}
    </aside>
  </div>
  {#if magnified && !(panning && zoom > 1)}
    <Magnifier {image} point={magnified} {surface} {sampler} />
  {/if}
</section>

<style>
  .measure-page { display: flex; flex-direction: column; gap: 12px; }
  .measure-head { align-items: flex-start; display: flex; gap: 8px; }
  .back { color: var(--ink-muted); margin-left: -6px; }
  .measure-head > div { padding-top: 4px; }
  h2 { font-size: 1.4rem; line-height: 1.25; }
  .measure-head p { color: var(--ink-muted); font-size: 0.875rem; margin-top: 2px; }
  .measure-layout { align-items: start; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 320px; }
  .image-panel { min-width: 0; }
  .image-tools { align-items: center; border-bottom: 1px solid var(--hairline); display: flex; flex-wrap: wrap; gap: 8px 10px; min-height: 52px; padding: 6px 8px 6px 12px; }
  .step-hint { color: var(--ink); font-size: 0.85rem; font-weight: 500; }
  .zoom { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.82rem; gap: 8px; }
  .zoom select { min-height: 36px; }
  .image-scroll { background: var(--canvas-bg); max-height: calc(100dvh - 230px); min-height: 320px; overflow: auto; }
  svg { --image-height: clamp(300px, calc(100dvh - 250px), 900px); display: block; min-height: 240px; touch-action: none; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  svg:focus:not(:focus-visible) { outline: none; }
  g[data-endpoint]:focus { outline: none; }
  g[data-endpoint]:focus-visible :global(.arm), g[data-endpoint]:focus-visible :global(.ring) { stroke-width: 2.25; }
  .leg-tag rect { fill: var(--surface); fill-opacity: 0.92; stroke: #3050d0; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .leg-tag text { fill: #3050d0; font-family: Inter, system-ui, sans-serif; font-size: 11px; font-variant-numeric: tabular-nums; font-weight: 600; }

  .measure-panel { display: grid; gap: 12px; position: sticky; top: calc(var(--app-bar-height) + 12px); }
  .panel-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); display: grid; gap: 12px; padding: 16px; }
  .card-head { align-items: center; display: flex; justify-content: space-between; gap: 8px; margin: -4px -6px -4px 0; }
  h3 { align-items: center; display: flex; font-size: 0.95rem; gap: 8px; }
  .step-badge { align-items: center; background: var(--accent); border-radius: 50%; color: var(--on-accent); display: inline-flex; font-size: 0.72rem; font-weight: 700; height: 20px; justify-content: center; width: 20px; }
  .step-badge.done { background: var(--ok); }
  .muted { color: var(--ink-muted); }
  .small { font-size: 0.8rem; line-height: 1.5; }
  .warn { color: var(--warning); }
  .steps { counter-reset: step; display: grid; gap: 6px; list-style: none; }
  .steps li { align-items: center; color: var(--ink-muted); counter-increment: step; display: flex; font-size: 0.85rem; gap: 8px; }
  .steps li::before { align-items: center; border: 1.5px solid var(--hairline); border-radius: 50%; content: counter(step); display: inline-flex; flex: none; font-size: 0.7rem; font-weight: 600; height: 20px; justify-content: center; width: 20px; }
  .steps li.current { color: var(--ink); font-weight: 500; }
  .steps li.current::before { border-color: var(--accent); color: var(--accent); }
  .steps li.done::before { background: var(--ok); border-color: var(--ok); color: #fff; content: '✓'; }
  label { color: var(--ink); display: grid; font-size: 0.82rem; font-weight: 500; gap: 6px; }
  input { background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; color: var(--ink); min-height: 40px; min-width: 0; padding: 0 0.7rem; width: 100%; }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); outline: none; }
  label select { width: 100%; }
  fieldset { border: 1px solid var(--hairline); border-radius: var(--radius); display: grid; gap: 10px; padding: 10px 12px 12px; }
  legend { font-size: 0.82rem; font-weight: 500; padding: 0 4px; }
  .size-fields { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  dl { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
  dl div { background: var(--surface-2); border-radius: 10px; padding: 8px 10px; }
  dt { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.75rem; gap: 5px; }
  dd { font-size: 0.95rem; font-variant-numeric: tabular-nums; font-weight: 600; margin-top: 2px; }
  .point-steps { align-items: center; display: flex; font-size: 0.75rem; gap: 8px; }
  .point-steps span:not(.line) { border: 1px solid var(--hairline); border-radius: 999px; color: var(--ink-muted); padding: 3px 8px; }
  .point-steps span.done:not(.line) { background: var(--accent-tint); border-color: transparent; color: var(--accent); font-weight: 500; }
  .point-steps .line { background: var(--hairline); flex: 1; height: 1.5px; }
  .point-steps .line.done { background: var(--accent); }
  .results { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
  .results div { background: var(--surface-2); border-radius: 12px; display: grid; font-variant-numeric: tabular-nums; gap: 4px; padding: 12px; }
  .axis { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.78rem; gap: 5px; }
  .results strong { font-size: 1.6rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
  .absolute { color: var(--accent); font-size: 0.9rem; font-weight: 600; overflow-wrap: anywhere; }
  .error { color: var(--danger); font-size: 0.85rem; }
  .notice { align-items: center; background: var(--ok-tint); border-radius: 10px; color: var(--ok); display: flex; font-size: 0.82rem; gap: 6px; padding: 8px 10px; }
  @media (max-width: 899px) {
    .measure-layout { grid-template-columns: 1fr; }
    .measure-panel { position: static; }
    .image-scroll { max-height: 62vh; }
    svg { --image-height: 52vh; }
  }
  @media (max-width: 719px) {
    .image-scroll { max-height: 54vh; min-height: 240px; }
    svg { --image-height: 46vh; }
    .measure-head p { display: none; }
  }
</style>
