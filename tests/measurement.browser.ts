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
    check(getComputedStyle(endpoint.querySelector('.marker')!).fill === 'none', 'Crosshair center has no opaque fill');
    check(endpoint.querySelectorAll('.marker').length === 1 && (endpoint.querySelector('.marker') as SVGGraphicsElement).getBBox().width === 36, 'Single-stroke crosshair is 50% longer, without a duplicate halo');
    const surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    const capture = surface.setPointerCapture;
    const release = surface.releasePointerCapture;
    // Synthetic pointer events need capture stubbed; actual capture is exercised in the browser workflow.
    surface.setPointerCapture = () => {};
    surface.releasePointerCapture = () => {};
    try {
      const screen = new DOMPoint(421, 260).matrixTransform(surface.getScreenCTM()!);
      endpoint.querySelector('circle')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, button: 0, clientX: screen.x, clientY: screen.y }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'hidden' && getComputedStyle(surface).cursor === 'none', 'Active marker and mouse cursor disappear during dragging');
      check(getComputedStyle(target.querySelector('[data-endpoint="0"] .marker')!).visibility === 'visible', 'The other endpoint stays visible');
      surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: screen.x, clientY: screen.y }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible', 'Marker returns on release');
      endpoint.querySelector('circle')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 2, button: 0, clientX: screen.x, clientY: screen.y }));
      surface.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
      await tick();
      check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible', 'Marker returns on cancellation');
    } finally {
      surface.setPointerCapture = capture;
      surface.releasePointerCapture = release;
    }
    const zoom = target.querySelector('select')!;
    zoom.value = '2';
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => Math.abs((endpoint as SVGGraphicsElement).getScreenCTM()!.a - 1) < 0.01);
    check(target.querySelector('.results')!.textContent!.includes('60.25%'), 'Zoom does not change image-space measurements');
    await unmount(component);
    component = mount(MeasureView, { target, props: { image, file, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    check(target.querySelectorAll('[data-endpoint]').length === 0 && !target.querySelector('.results')!.textContent!.includes('%'), 'Measurements disappear when the view is reopened');
    check(JSON.stringify(await loadCalibration(file)) === JSON.stringify(calibration), 'Calibration survives reopening');
    target.querySelector<HTMLButtonElement>('[aria-label="Redo calibration"]')!.click();
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
    await place(400, 300);
    check(target.querySelectorAll('.results strong')[0].textContent === '50%' && target.querySelectorAll('.results strong')[1].textContent === '—', 'An uncalibrated axis is unavailable');
    return 'PASS: part coordinates, independent axis ratios and paper sizes, keyboard nudging, hollow markers, zoom invariance, ephemeral measurements, persisted calibration, single-axis recalibration, and invalid-size rejection';
  } finally {
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(url);
  }
}
