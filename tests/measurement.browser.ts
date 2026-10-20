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
  context.fillStyle = '#406040';
  context.fillRect(0, 0, 800, 600);
  const aligned = context.getImageData(0, 0, 800, 600);
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
    component = mount(MeasureView, { target, props: { image, file, aligned, region: { x: 100, y: 150, width: 400, height: 200 }, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    await waitFor(() => !!target.querySelector('.corresponding-image'));
    let surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    function checkCorrespondence(label: string) {
      const other = target.querySelector<SVGSVGElement>('.corresponding-image')!;
      check(other.viewBox.baseVal.x === surface.viewBox.baseVal.x
        && other.viewBox.baseVal.y === surface.viewBox.baseVal.y
        && other.viewBox.baseVal.width === surface.viewBox.baseVal.width
        && other.viewBox.baseVal.height === surface.viewBox.baseVal.height, `${label}: both images show the same full-image or part bounds`);
      check(other.querySelector('path[stroke-dasharray]')?.getAttribute('d') === surface.querySelector('path[stroke-dasharray]')?.getAttribute('d'), `${label}: both connecting legs use the same image coordinates`);
      for (const [original, mirrored] of [['[data-endpoint="0"]', '.corresponding-anchor'], ['.placement-cursor', '.corresponding-cursor']]) {
        check(surface.querySelector(original)!.getAttribute('transform')!.split(' scale')[0]
          === other.querySelector(mirrored)!.getAttribute('transform')!.split(' scale')[0], `${label}: anchor and moving point correspond exactly`);
      }
    }
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
    const both = target.querySelector<HTMLButtonElement>('[aria-label="View both images"]')!;
    check(both.getAttribute('aria-pressed') === 'true', 'Both images are visible by default');
    checkCorrespondence('Reference part to aligned source part');
    const mirroredSourceUrl = target.querySelector('.corresponding-image image')!.getAttribute('href');
    const referenceMeasurement = surface.querySelector('path[stroke-dasharray]')!.getAttribute('d');
    both.click();
    await tick();
    check(!target.querySelector('.corresponding-image') && both.getAttribute('aria-pressed') === 'false'
      && surface.querySelector('path[stroke-dasharray]')!.getAttribute('d') === referenceMeasurement, 'Toggle hides the corresponding image without changing the measurement');
    both.click();
    await waitFor(() => !!target.querySelector('.corresponding-image'));
    checkCorrespondence('Restored corresponding image');
    check(target.querySelectorAll('[data-endpoint]').length === 1, 'Only Point 1 is anchored, never the moving cursor');
    check(surface.querySelectorAll('path[stroke-dasharray]').length === 1, 'The guide is one dashed stroke per image, without a second halo stroke');
    const endpoint = target.querySelector('[data-endpoint="0"]')!;
    const guide = target.querySelector('path[stroke-dasharray]')!;
    const overlays = [...target.querySelectorAll('.placement-cursor, .leg-tag')];
    check(overlays.length === 3, 'The visibility check includes the cursor and both distance labels');
    const positions = () => JSON.stringify([guide, ...overlays].map((element) => [element.getAttribute('d'), element.getAttribute('transform'), element.textContent]));
    const beforeHide = positions();
    const beforeResults = target.querySelector('.results')!.textContent;
    async function inkNearCursor() {
      // Rasterize the displayed guide alone; check the final five screen pixels,
      // allowing for its four-pixel dash gaps but not a six-pixel cursor cutout.
      const copy = surface.cloneNode(true) as SVGSVGElement;
      copy.querySelectorAll('image, [data-endpoint], .placement-cursor, .leg-tag').forEach((element) => element.remove());
      const rect = surface.getBoundingClientRect();
      copy.setAttribute('width', String(rect.width));
      copy.setAttribute('height', String(rect.height));
      copy.removeAttribute('style');
      const raster = new Image();
      raster.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      await raster.decode();
      const pixels = document.createElement('canvas');
      pixels.width = Math.ceil(rect.width * 2);
      pixels.height = Math.ceil(rect.height * 2);
      const ctx = pixels.getContext('2d')!;
      ctx.drawImage(raster, 0, 0, rect.width * 2, rect.height * 2);
      const end = new DOMPoint(420, 260).matrixTransform(surface.getScreenCTM()!);
      const data = ctx.getImageData(Math.round((end.x - rect.left) * 2) - 1,
        Math.round((end.y - rect.top) * 2) - 10, 2, 10).data;
      return data.some((value, index) => index % 4 === 3 && value > 0);
    }
    check(!await inkNearCursor(), 'The visible cursor keeps its open centre free of guide ink');
    check(!!target.querySelector('.magnifier'), 'Magnifier is present before hiding');
    key(endpoint, 'Shift', true);
    await tick();
    check(await inkNearCursor(), 'Shift extends the rendered guide into the hidden cursor centre instead of leaving a six-pixel cutout');
    check(overlays.every((element) => getComputedStyle(element).visibility === 'hidden')
      && !target.querySelector('.magnifier') && getComputedStyle(guide).visibility === 'visible', 'Shift hides cursor, on-image labels and magnifier but keeps both connecting legs visible even when the anchor has keyboard focus');
    check(getComputedStyle(target.querySelector('.corresponding-cursor')!).visibility === 'hidden'
      && getComputedStyle(target.querySelector('.corresponding-image path[stroke-dasharray]')!).visibility === 'visible', 'Shift also hides the mirrored cursor while keeping mirrored connecting lines visible');
    check(getComputedStyle(endpoint.querySelector('.marker')!).visibility === 'visible'
      && positions() === beforeHide && target.querySelector('.results')!.textContent === beforeResults, 'Hiding keeps the fixed anchor, coordinates and sidebar distances unchanged');
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: true, bubbles: true }));
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'hidden'), 'Releasing one Shift key while the other is held keeps overlays hidden');
    target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
    await tick();
    check(overlays.every((element) => getComputedStyle(element).visibility === 'visible')
      && positions() === beforeHide && !!target.querySelector('.magnifier'), 'Releasing Shift outside the image restores all overlays in exactly the same positions');
    check(!await inkNearCursor(), 'Releasing Shift restores the open-centre guide clearance');
    for (const [name, stroke] of [['w', 'rgb(255, 255, 255)'], ['r', 'rgb(255, 0, 0)'], ['y', 'rgb(255, 255, 0)'], ['k', 'rgb(0, 0, 0)'], ['b', 'rgb(48, 80, 208)']]) {
      key(endpoint, name);
      await tick();
      check(getComputedStyle(guide).stroke === stroke && positions() === beforeHide
        && target.querySelector('.results')!.textContent === beforeResults, `${name} changes only the connecting line color, not the measurement`);
      check(getComputedStyle(target.querySelector('.corresponding-image path[stroke-dasharray]')!).stroke === stroke, `${name} also colors the corresponding line`);
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      endpoint.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', [modifier]: true, bubbles: true }));
      await tick();
      check(getComputedStyle(guide).stroke === 'rgb(48, 80, 208)', `${modifier} shortcuts do not change line color`);
    }
    key(target.querySelector('select')!, 'r');
    await tick();
    check(getComputedStyle(guide).stroke === 'rgb(48, 80, 208)', 'Typing in a select does not trigger a line color shortcut');
    key(surface, 'Shift', true);
    key(endpoint, 'R', true);
    await tick();
    check(getComputedStyle(guide).stroke === 'rgb(255, 0, 0)' && getComputedStyle(guide).visibility === 'visible', 'Uppercase color shortcuts work while Shift is held');
    await hover(450, 300);
    key(surface, 'ArrowRight', true);
    await tick();
    check(target.querySelectorAll('.results strong')[0].textContent === '70%'
      && target.querySelectorAll('.results strong')[1].textContent === '55%'
      && overlays.every((element) => getComputedStyle(element).visibility === 'hidden')
      && getComputedStyle(guide).visibility === 'visible', 'Measurement stays live with connecting lines visible and Shift-arrow still moves the cursor ten pixels');
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
    checkCorrespondence('Zoomed reference to fit source');
    surface.dispatchEvent(new PointerEvent('pointerleave'));
    await tick();
    check(!target.querySelector('path[stroke-dasharray]') && !target.querySelector('.results')!.textContent!.includes('%')
      && target.querySelectorAll('[data-endpoint]').length === 1, 'Leaving the image hides live results but keeps Point 1');
    key(surface, 'Escape');
    await tick();
    await hover(430, 255);
    check(target.querySelectorAll('[data-endpoint]').length === 0 && !target.querySelector('.results')!.textContent!.includes('%'), 'Escape removes the anchor and the measurement');
    await waitFor(() => !target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.disabled);
    target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.click();
    await tick();
    check(surface.viewBox.baseVal.x === 100 && surface.viewBox.baseVal.y === 150
      && surface.viewBox.baseVal.width === 400 && surface.viewBox.baseVal.height === 200, 'Source parts keep reference-space crop coordinates');
    const sourceUrl = surface.querySelector('image')!.getAttribute('href')!;
    check(mirroredSourceUrl === sourceUrl, 'Reference measurements mirror onto the same aligned source pixels used for source measurement');
    const source = new Image();
    source.src = sourceUrl;
    await source.decode();
    context.drawImage(source, 0, 0);
    check(sourceUrl !== image.src && context.getImageData(420, 260, 1, 1).data.slice(0, 3).join(',') === '64,96,64', 'Source selection displays aligned source pixels, not the reference');
    await place(180, 190);
    await hover(420, 260);
    check(target.querySelectorAll('.results strong')[0].textContent === '60%'
      && target.querySelectorAll('.results strong')[1].textContent === '35%'
      && target.querySelector('.results')!.textContent!.includes('1.2 cm')
      && target.querySelector('.results')!.textContent!.includes('1.05 cm'), 'Source parts use the same separate reference calibration spans and paper sizes');
    checkCorrespondence('Aligned source part to reference part');
    check(target.querySelector('.corresponding-image image')!.getAttribute('href') === image.src, 'Measuring source mirrors onto reference pixels');
    check(target.querySelector('.magnifier image')!.getAttribute('href') === sourceUrl, 'Source magnifier uses source pixels');
    target.querySelector<HTMLButtonElement>('[aria-label="Redo calibration"]')!.click();
    await tick();
    check(surface.querySelector('image')!.getAttribute('href') === image.src
      && surface.viewBox.baseVal.x === 0 && surface.viewBox.baseVal.width === 800
      && surface.viewBox.baseVal.height === 600, 'Recalibrating from a source part always uses the full reference');
    check(!target.querySelector('.corresponding-image') && !target.querySelector('[aria-label="View both images"]'), 'Calibration stays reference-only');
    target.querySelector<HTMLButtonElement>('[aria-label="Cancel calibration"]')!.click();
    await tick();
    check(surface.querySelector('image')!.getAttribute('href') === sourceUrl, 'Cancel returns to the selected source part');
    target.querySelector<HTMLButtonElement>('[aria-label="Measure reference"]')!.click();
    await tick();
    check(surface.querySelector('image')!.getAttribute('href') === image.src
      && target.querySelectorAll('[data-endpoint]').length === 0, 'Switching images clears transient anchors and restores reference pixels');
    check(JSON.stringify(await loadCalibration(file)) === JSON.stringify(calibration), 'Switching and cancelling source recalibration do not create or change the reference scale');
    await unmount(component);
    component = mount(MeasureView, { target, props: { image, file, aligned, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    check(target.querySelectorAll('[data-endpoint]').length === 0 && !target.querySelector('.results')!.textContent!.includes('%'), 'Measurements disappear when the view is reopened');
    check(JSON.stringify(await loadCalibration(file)) === JSON.stringify(calibration), 'Calibration survives reopening');
    await waitFor(() => !target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.disabled);
    target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.click();
    await tick();
    check(surface.viewBox.baseVal.width === 800 && surface.viewBox.baseVal.height === 600, 'Whole source uses the full reference coordinate system');
    await place(100, 100);
    await hover(600, 250);
    check(target.querySelectorAll('.results strong')[0].textContent === '125%'
      && target.querySelectorAll('.results strong')[1].textContent === '75%'
      && target.querySelector('.results')!.textContent!.includes('2.5 cm')
      && target.querySelector('.results')!.textContent!.includes('2.25 cm'), 'Whole source measurements share the persisted reference scale, including distances larger than the calibration span');
    checkCorrespondence('Whole aligned source to reference');
    target.querySelector<HTMLButtonElement>('[aria-label="Measure reference"]')!.click();
    await tick();
    await place(150, 200);
    await hover(650, 350);
    checkCorrespondence('Whole reference to aligned source');
    target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.click();
    await tick();
    target.querySelector<HTMLButtonElement>('[aria-label="Redo calibration"]')!.click();
    await tick();
    await checkZoom('2', 400, 300);
    await checkZoom('4', 400, 300);
    await place(100, 100);
    await place(500, 100);
    check(ring(target.querySelector('[data-endpoint="0"] .marker')!) === 'rgb(255, 255, 255)', 'Reference calibration uses the same white crosshairs');
    check(getComputedStyle(target.querySelector('[data-endpoint="0"] .hit-target')!).cursor === 'grab', 'Reference calibration drag area also uses the grab cursor');
    key(surface, 'Shift', true);
    key(surface, 'r');
    await tick();
    check(getComputedStyle(target.querySelector('path[stroke-dasharray]')!).visibility === 'visible'
      && getComputedStyle(target.querySelector('path[stroke-dasharray]')!).stroke === 'rgb(48, 80, 208)', 'Shift and color shortcuts leave the two-point calibration guide unchanged');
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
    check(target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.getAttribute('aria-pressed') === 'true', 'Saving a replacement scale returns to source measurement');
    check(replaced?.points[0].x === 100 && replaced.points[1].x === 500, 'Source-triggered recalibration replaces the single reference calibration');
    await unmount(component);
    component = mount(MeasureView, { target, props: { image, file, hasSource: true, onback: () => {} } });
    await waitFor(() => !!target.querySelector('.results'));
    check(target.querySelector<HTMLButtonElement>('[aria-label="Measure source"]')!.disabled
      && target.textContent!.includes('Align the source in Compare'), 'Unaligned source measurements require alignment rather than using an unrelated pixel scale');
    check(!target.querySelector('[aria-label="View both images"]') && !target.querySelector('.corresponding-image'), 'Without alignment there is no misleading corresponding-image toggle or preview');
    return 'PASS: bidirectional corresponding points and lines for whole images and parts, default-on toggle, mirrored Shift/color/zoom behavior, calibration and unaligned-source exclusions; shared reference calibration, source pixels/magnifier, switching, keyboard, persistence, and invalid-size checks';
  } finally {
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(url);
  }
}
