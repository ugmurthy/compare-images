import { mount, tick, unmount } from 'svelte';
import MeasureView from '../src/components/MeasureView.svelte';
import { loadCalibration, saveCalibration } from '../src/lib/history';
import type { Calibration } from '../src/lib/measurement';

// Run in a disposable browser against Vite:
// await (await import('/tests/measurement.browser.ts')).testMeasurement()
export async function testMeasurement(): Promise<string> {
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#202020';
  context.fillRect(0, 0, 400, 600);
  context.fillStyle = '#eeeeee';
  context.fillRect(400, 0, 400, 600);
  context.fillStyle = '#808080';
  context.fillRect(350, 0, 30, 600);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
  const file = new File([blob], 'measurement-test.png', { type: 'image/png' });
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const calibration: Calibration = { points: [{ x: 100, y: 100 }, { x: 500, y: 300 }], horizontal: 2, vertical: 3, unit: 'cm' };
  await saveCalibration(file, calibration);
  const target = document.createElement('div');
  document.body.append(target);
  let component: ReturnType<typeof mount> | undefined;
  async function waitFor(predicate: () => boolean) {
    for (let i = 0; i < 100; i++) {
      await tick();
      if (predicate()) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Measurement UI did not settle');
  }
  function key(element: Element, name: string, shiftKey = false) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));
  }
  async function place(x: number, y: number) {
    const surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    const bounds = surface.viewBox.baseVal;
    for (const [delta, positive, negative] of [[x - bounds.x - bounds.width / 2, 'ArrowRight', 'ArrowLeft'], [y - bounds.y - bounds.height / 2, 'ArrowDown', 'ArrowUp']] as const) {
      let remaining = Math.abs(delta);
      while (remaining >= 10) { key(surface, delta > 0 ? positive : negative, true); remaining -= 10; }
      while (remaining >= 1) { key(surface, delta > 0 ? positive : negative); remaining--; }
    }
    key(surface, 'Enter');
    await tick();
  }
  try {
    component = mount(MeasureView, { target, props: { image, file, region: { x: 100, y: 150, width: 400, height: 200 }, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    let surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    async function hover(x: number, y: number, element: Element = surface) {
      const screen = new DOMPoint(x, y).matrixTransform(surface.getScreenCTM()!);
      element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: screen.x, clientY: screen.y }));
      await tick();
      return target.querySelector('.placement-cursor .marker')!;
    }
    await hover(420, 260);
    check(!target.querySelector('.results')!.textContent!.includes('%'), 'Hovering before anchoring does not measure');
    surface.dispatchEvent(new PointerEvent('pointerleave'));
    await tick();
    await place(180, 190);
    await hover(420, 260);
    check(target.querySelector('.results')!.textContent!.includes('60%') && target.querySelector('.results')!.textContent!.includes('35%'), 'Part measurements use the full-reference pixel spans, not crop dimensions');
    check(target.querySelector('.results')!.textContent!.includes('1.2 cm') && target.querySelector('.results')!.textContent!.includes('1.05 cm'), 'Separate paper sizes produce correct absolute distances');
    check(target.querySelectorAll('[data-endpoint]').length === 1, 'Only Point 1 is anchored, never the moving cursor');
    check(target.querySelectorAll('path[stroke-dasharray]').length === 1, 'The guide is one dashed stroke, without a second halo stroke');
    const endpoint = target.querySelector('[data-endpoint="0"]')!;
    const overlays = [...target.querySelectorAll('path[stroke-dasharray], .placement-cursor, .leg-tag')];
    check(overlays.length === 4, 'The visibility check includes the cursor, guide and both distance labels');
    const positions = () => JSON.stringify(overlays.map((element) => [element.getAttribute('d'), element.getAttribute('transform'), element.textContent]));
    const beforeHide = positions();
    const beforeResults = target.querySelector('.results')!.textContent;
    check(!!target.querySelector('.magnifier'), 'Magnifier is present before hiding');
    key(endpoint, 'Shift', true);
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'hidden')
      && !target.querySelector('.magnifier'), 'Shift hides cursor, both guide legs, on-image labels and magnifier even when the anchor has keyboard focus');
    check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible'
      && positions() === beforeHide && target.querySelector('.results')!.textContent === beforeResults, 'Hiding keeps the fixed anchor, coordinates and sidebar distances unchanged');
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: true, bubbles: true }));
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'hidden'), 'Releasing one Shift key while the other is held keeps overlays hidden');
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'visible')
      && positions() === beforeHide && !!target.querySelector('.magnifier'), 'Releasing Shift outside the image restores all overlays in exactly the same positions');
    key(surface, 'Shift', true);
    await hover(450, 300);
    key(surface, 'ArrowRight', true);
    await tick();
    check(target.querySelectorAll('.results strong')[0].textContent === '70%'
      && target.querySelectorAll('.results strong')[1].textContent === '55%'
      && overlays.every((element) => getComputedStyle(element).visibility === 'hidden'), 'Hidden measurement stays live and Shift-arrow still moves the cursor ten pixels');
    window.dispatchEvent(new Event('blur'));
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'visible'), 'Window blur prevents a lost Shift release from leaving overlays hidden');
    await hover(420, 260);
    key(endpoint, 'ArrowRight');
    await tick();
    await hover(420, 260);
    check(target.querySelector('.results')!.textContent!.includes('59.75%'), 'Anchor keyboard nudging updates subsequent live measurements');
    const strokes = (marker: Element) => [...marker.querySelectorAll('.arm, .ring')].map((part) => getComputedStyle(part).stroke);
    const ring = (marker: Element) => getComputedStyle(marker.querySelector('.ring')!).stroke;
    const arm = (marker: Element, name: string) => getComputedStyle(marker.querySelector(`[data-arm="${name}"]`)!).stroke;
    check([...endpoint.querySelectorAll('.marker .arm, .marker .ring')].every((part) => getComputedStyle(part).fill === 'none'), 'Crosshair center has no opaque fill');
    check(strokes(endpoint.querySelector('.marker')!).every((stroke) => stroke === 'rgb(255, 255, 255)'), 'Measurement anchor is white on a dark background');
    check(getComputedStyle(endpoint.querySelector('.hit-target')!).cursor === 'none', 'Measurement anchor does not suggest dragging');
    check(endpoint.querySelectorAll('.marker').length === 1 && endpoint.querySelectorAll('.marker .arm').length === 4
      && (endpoint.querySelector('.marker') as SVGGraphicsElement).getBBox().width === 36, 'One open crosshair with four single-stroke arms, without a duplicate halo');
    const cursorStyle = getComputedStyle(surface).cursor;
    let preview = await hover(200, 230);
    check(cursorStyle === 'none' && preview.innerHTML.replace(/style="[^"]*"/g, '') === endpoint.querySelector('.marker')!.innerHTML.replace(/style="[^"]*"/g, '')
      && strokes(preview).every((stroke) => stroke === 'rgb(255, 255, 255)'), 'Drawn placement cursor matches marker shape and contrasts with dark background');
    preview = await hover(450, 230);
    check(strokes(preview).every((stroke) => stroke === 'rgb(0, 0, 0)'), 'Placement cursor switches to black on light background');
    preview = await hover(360, 230);
    check(ring(preview) === 'rgb(0, 0, 0)', 'Neutral texture retains black rather than flickering');
    await hover(200, 230);
    preview = await hover(360, 230);
    check(ring(preview) === 'rgb(255, 255, 255)', 'Neutral texture retains white after a dark background');
    preview = await hover(396, 230);
    check(arm(preview, 'left') === 'rgb(255, 255, 255)' && arm(preview, 'right') === 'rgb(0, 0, 0)', 'Each arm adapts separately where the crosshair straddles a dark/light edge');
    await hover(181, 190, endpoint.querySelector('.hit-target')!);
    check([...target.querySelectorAll('.results strong')].every((value) => value.textContent === '0%'), 'Hovering over the anchor produces zero distances instead of hiding the result');
    const capture = surface.setPointerCapture;
    const release = surface.releasePointerCapture;
    // Synthetic pointer events need capture stubbed; actual capture is exercised in the browser workflow.
    surface.setPointerCapture = () => {};
    surface.releasePointerCapture = () => {};
    async function pointer(type: string, x: number, y: number, element: Element = surface) {
      const screen = new DOMPoint(x, y).matrixTransform(surface.getScreenCTM()!);
      element.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerType: 'mouse', pointerId: 1, button: 0, clientX: screen.x, clientY: screen.y }));
      await tick();
    }
    try {
      await pointer('pointerdown', 420, 260);
      await pointer('pointerup', 420, 260);
      await hover(300, 220);
      check(target.querySelectorAll('[data-endpoint]').length === 1
        && target.querySelectorAll('.results strong')[0].textContent === '30%'
        && target.querySelectorAll('.results strong')[1].textContent === '20%', 'The next click replaces Point 1 rather than fixing Point 2; negative deltas remain absolute');
      check(strokes(endpoint.querySelector('.marker')!).every((stroke) => stroke === 'rgb(0, 0, 0)'), 'Reanchored marker adapts to a light background');
      await pointer('pointerdown', 410, 255, endpoint.querySelector('.hit-target')!);
      await pointer('pointermove', 330, 215);
      await pointer('pointerup', 330, 215);
      check(endpoint.getAttribute('aria-label')!.includes('x 410, y 255')
        && target.querySelectorAll('.results strong')[0].textContent === '20%'
        && target.querySelectorAll('.results strong')[1].textContent === '20%', 'Clicking the old anchor hit area also reanchors; holding and moving never drags Point 1');
      key(surface, 'Enter');
      await tick();
      key(surface, 'ArrowRight', true);
      await tick();
      check(endpoint.getAttribute('aria-label')!.includes('x 330, y 215')
        && target.querySelectorAll('.results strong')[0].textContent === '5%'
        && target.querySelectorAll('.results strong')[1].textContent === '17.5%', 'Enter replaces the anchor; arrow keys measure live from the new anchor (cursor restarts at the part centre)');
      await hover(430, 255);
      check(target.querySelectorAll('.results strong')[0].textContent === '25%'
        && target.querySelectorAll('.results strong')[1].textContent === '20%', 'Cursor movement continuously updates both axis results');
    } finally {
      surface.setPointerCapture = capture;
      surface.releasePointerCapture = release;
    }
    async function checkZoom(value: string, centerX: number, centerY: number) {
      const zoom = target.querySelector('select')!;
      zoom.value = value;
      zoom.dispatchEvent(new Event('change', { bubbles: true }));
      const viewport = target.querySelector('.image-scroll')!;
      await waitFor(() => {
        const s = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
        const center = new DOMPoint(centerX, centerY).matrixTransform(s.getScreenCTM()!);
        const rect = viewport.getBoundingClientRect();
        return Math.abs(center.x - rect.left - viewport.clientWidth / 2) < 1
          && Math.abs(center.y - rect.top - viewport.clientHeight / 2) < 1;
      });
      check(viewport.scrollLeft > 0 && viewport.scrollTop > 0, `${value}× zoom centers both scroll axes`);
    }
    await checkZoom('2', 300, 250);
    await checkZoom('4', 300, 250);
    await hover(430, 255);
    check(target.querySelectorAll('.results strong')[0].textContent === '25%'
      && target.querySelectorAll('.results strong')[1].textContent === '20%', 'Zoom does not change image-space live measurements');
    surface.dispatchEvent(new PointerEvent('pointerleave'));
    await tick();
    check(!target.querySelector('path[stroke-dasharray]') && !target.querySelector('.results')!.textContent!.includes('%')
      && target.querySelectorAll('[data-endpoint]').length === 1, 'Leaving the image hides live results but keeps Point 1');
    key(surface, 'Escape');
    await tick();
    await hover(430, 255);
    check(target.querySelectorAll('[data-endpoint]').length === 0 && !target.querySelector('.results')!.textContent!.includes('%'), 'Escape removes the anchor and the measurement');
    await unmount(component);
    component = mount(MeasureView, { target, props: { image, file, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    check(target.querySelectorAll('[data-endpoint]').length === 0 && !target.querySelector('.results')!.textContent!.includes('%'), 'Measurements disappear when the view is reopened');
    check(JSON.stringify(await loadCalibration(file)) === JSON.stringify(calibration), 'Calibration survives reopening');
    target.querySelector<HTMLButtonElement>('[aria-label="Redo calibration"]')!.click();
    await tick();
    await checkZoom('2', 400, 300);
    await checkZoom('4', 400, 300);
    await place(100, 100);
    await place(500, 100);
    check(ring(target.querySelector('[data-endpoint="0"] .marker')!) === 'rgb(255, 255, 255)', 'Reference calibration uses the same white crosshairs');
    check(getComputedStyle(target.querySelector('[data-endpoint="0"] .hit-target')!).cursor === 'grab', 'Reference calibration drag area also uses the grab cursor');
    key(surface, 'Shift', true);
    await tick();
    check(getComputedStyle(target.querySelector('path[stroke-dasharray]')!).visibility === 'visible', 'Shift does not hide the two-point calibration guide');
    surface.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    await tick();
    const calibrationEndpoint = target.querySelector('[data-endpoint="1"]')!;
    surface.setPointerCapture = () => {};
    surface.releasePointerCapture = () => {};
    try {
      await hover(500, 100, calibrationEndpoint.querySelector('.hit-target')!);
      check(!target.querySelector('.placement-cursor'), 'Calibration still hides the cursor over a draggable endpoint');
      await pointer('pointerdown', 500, 100, calibrationEndpoint.querySelector('.hit-target')!);
      await pointer('pointermove', 490, 110);
      check(calibrationEndpoint.getAttribute('aria-label')!.includes('x 490, y 110')
        && target.querySelectorAll('[data-endpoint]').length === 2, 'Calibration still drags Point 2 without replacing Point 1');
      await pointer('pointerup', 500, 100);
      check(getComputedStyle(calibrationEndpoint.querySelector('.hit-target')!).cursor === 'grab', 'Calibration restores the grab cursor on release');
    } finally {
      surface.setPointerCapture = capture;
      surface.releasePointerCapture = release;
    }
    // Use exact keyboard coordinates for the zero-span boundary, avoiding pointer matrix roundoff.
    key(surface, 'Escape');
    await tick();
    await place(100, 100);
    await place(500, 100);
    const save = target.querySelector<HTMLButtonElement>('[aria-label="Save calibration"]')!;
    check(save.disabled, 'A zero vertical span cannot calibrate both axes');
    const axes = target.querySelectorAll('select')[1];
    axes.value = 'horizontal';
    axes.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    check(!save.disabled, 'Horizontal-only calibration accepts a horizontal span');
    const size = target.querySelector('input[type="number"]') as HTMLInputElement;
    size.value = '-2';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    check(save.disabled, 'Negative paper sizes cannot be saved');
    size.value = '';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    save.click();
    await waitFor(() => !!target.querySelector('.results'));
    const replaced = await loadCalibration(file);
    check(replaced?.horizontal === null && replaced.vertical === null && replaced.points[1].y === 100, 'Redo replaces the one calibration with a percent-only horizontal reference');
    await place(200, 200);
    await hover(400, 300);
    check(target.querySelectorAll('.results strong')[0].textContent === '50%' && target.querySelectorAll('.results strong')[1].textContent === '—', 'An uncalibrated axis is unavailable');
    return 'PASS: Shift hold/release visibility with exact position restoration, dual-Shift handling and blur recovery, live hidden measurements, click/keyboard reanchoring, fixed Point 1, single dashed guide, adaptive crosshairs, part coordinates, zoom invariance, clearing, unchanged two-point calibration, single-axis recalibration, and invalid-size rejection';
  } finally {
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(url);
  }
}
