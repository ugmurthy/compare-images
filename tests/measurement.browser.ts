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
      if (predicate()) return;
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
    await place(180, 190);
    await place(420, 260);
    check(target.querySelector('.results')!.textContent!.includes('60%') && target.querySelector('.results')!.textContent!.includes('35%'), 'Part measurements use the full-reference pixel spans, not crop dimensions');
    check(target.querySelector('.results')!.textContent!.includes('1.2 cm') && target.querySelector('.results')!.textContent!.includes('1.05 cm'), 'Separate paper sizes produce correct absolute distances');
    const endpoint = target.querySelector('[data-endpoint="1"]')!;
    key(endpoint, 'ArrowRight');
    await tick();
    check(target.querySelector('.results')!.textContent!.includes('60.25%'), 'Endpoint keyboard nudging updates results');
    const strokes = (marker: Element) => [...marker.querySelectorAll('.arm, .ring')].map((part) => getComputedStyle(part).stroke);
    const ring = (marker: Element) => getComputedStyle(marker.querySelector('.ring')!).stroke;
    const arm = (marker: Element, name: string) => getComputedStyle(marker.querySelector(`[data-arm="${name}"]`)!).stroke;
    check([...endpoint.querySelectorAll('.marker .arm, .marker .ring')].every((part) => getComputedStyle(part).fill === 'none'), 'Crosshair center has no opaque fill');
    check(strokes(endpoint.querySelector('.marker')!).every((stroke) => stroke === 'rgb(0, 0, 0)'), 'Measurement crosshair is black on a light background');
    check(strokes(target.querySelector('[data-endpoint="0"] .marker')!).every((stroke) => stroke === 'rgb(255, 255, 255)'), 'Measurement crosshair is white on a dark background');
    check(getComputedStyle(endpoint.querySelector('.hit-target')!).cursor === 'grab', 'Endpoint drag area uses the grab cursor');
    check(endpoint.querySelectorAll('.marker').length === 1 && endpoint.querySelectorAll('.marker .arm').length === 4
      && (endpoint.querySelector('.marker') as SVGGraphicsElement).getBBox().width === 36, 'One open crosshair with four single-stroke arms, without a duplicate halo');
    const surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    const cursorStyle = getComputedStyle(surface).cursor;
    async function hover(x: number, y: number) {
      const screen = new DOMPoint(x, y).matrixTransform(surface.getScreenCTM()!);
      surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: screen.x, clientY: screen.y }));
      await tick();
      return target.querySelector('.placement-cursor .marker')!;
    }
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
    endpoint.querySelector('.hit-target')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    await tick();
    check(!target.querySelector('.placement-cursor'), 'Placement preview hides in endpoint grab area');
    const capture = surface.setPointerCapture;
    const release = surface.releasePointerCapture;
    // Synthetic pointer events need capture stubbed; actual capture is exercised in the browser workflow.
    surface.setPointerCapture = () => {};
    surface.releasePointerCapture = () => {};
    try {
      const screen = new DOMPoint(421, 260).matrixTransform(surface.getScreenCTM()!);
      endpoint.querySelector('circle')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, button: 0, clientX: screen.x, clientY: screen.y }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible' && getComputedStyle(surface).cursor === 'none', 'Active crosshair stays visible without a duplicate mouse cursor during dragging');
      check(getComputedStyle(target.querySelector('[data-endpoint="0"] .marker')!).visibility === 'visible', 'The other endpoint stays visible');
      const moved = new DOMPoint(390, 225).matrixTransform(surface.getScreenCTM()!);
      surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: moved.x, clientY: moved.y }));
      await tick();
      const center = new DOMPoint(0, 0).matrixTransform((endpoint as SVGGraphicsElement).getScreenCTM()!);
      check(Math.abs(center.x - moved.x) < 0.01 && Math.abs(center.y - moved.y) < 0.01
        && getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible', 'Visible crosshair tracks the exact dragged point');
      check(ring(endpoint.querySelector('.marker')!) === 'rgb(255, 255, 255)', 'Dragged crosshair switches to white over a dark background');
      surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: screen.x, clientY: screen.y }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible' && getComputedStyle(surface).cursor === cursorStyle, 'Marker remains visible and placement cursor returns on release');
      check(getComputedStyle(endpoint.querySelector('.hit-target')!).cursor === 'grab', 'Drag area restores the grab cursor on release');
      endpoint.querySelector('circle')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 2, button: 0, clientX: screen.x, clientY: screen.y }));
      surface.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible', 'Marker returns on cancellation');
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
    check(target.querySelector('.results')!.textContent!.includes('60.25%'), 'Centered zoom does not change image-space measurements');
    await unmount(component);
    component = mount(MeasureView, { target, props: { image, file, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
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
    await place(400, 300);
    check(target.querySelectorAll('.results strong')[0].textContent === '50%' && target.querySelectorAll('.results strong')[1].textContent === '—', 'An uncalibrated axis is unavailable');
    return 'PASS: per-arm adaptive crosshairs, part coordinates, independent axis ratios and paper sizes, keyboard nudging, hollow markers, zoom invariance, ephemeral measurements, persisted calibration, single-axis recalibration, and invalid-size rejection';
  } finally {
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(url);
  }
}
