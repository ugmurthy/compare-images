import { mount, tick, unmount } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import AnchorEditor from '../src/components/AnchorEditor.svelte';
import MeasureView from '../src/components/MeasureView.svelte';
import RegionSelector from '../src/components/RegionSelector.svelte';
import { magnifierPreferenceContext } from '../src/components/Magnifier.svelte';
import type { Point } from '../src/lib/manualAnchors';
import { saveCalibration } from '../src/lib/history';

// Run against Vite in a disposable browser, at desktop and narrow viewport sizes:
// await (await import('/tests/magnifier.browser.ts')).testMagnifier()
export async function testMagnifier(): Promise<string> {
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'white';
  context.fillRect(0, 0, 800, 600);
  context.fillStyle = 'black';
  context.fillRect(120, 90, 17, 39);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
  const file = new File([blob], 'magnifier-test.png', { type: 'image/png' });
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const target = document.createElement('div');
  target.style.cssText = 'position:absolute;top:0;left:0;width:100%;background:white;z-index:200';
  document.body.append(target);
  const enabled = writable(true);
  const preference = fromStore(enabled);
  const magnifierContext = new Map([[magnifierPreferenceContext, { get enabled() { return preference.current; } }]]);
  let component: ReturnType<typeof mount> | undefined;
  const settle = async () => { await tick(); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); };
  async function replace(create: () => ReturnType<typeof mount>) {
    if (component) await unmount(component);
    component = create();
    await settle();
  }
  function screen(surface: SVGSVGElement | HTMLElement, p: Point): Point {
    if (surface instanceof SVGSVGElement) return new DOMPoint(p.x, p.y).matrixTransform(surface.getScreenCTM()!);
    const rect = surface.getBoundingClientRect();
    const scale = Math.min(rect.width / 800, rect.height / 600);
    return { x: rect.left + (rect.width - 800 * scale) / 2 + p.x * scale,
      y: rect.top + (rect.height - 600 * scale) / 2 + p.y * scale };
  }
  async function pointer(surface: SVGSVGElement | HTMLElement, type: string, p: Point, pointerType = 'touch', element: Element = surface, pointerId = 7) {
    const client = screen(surface, p);
    // Synthetic events cannot establish browser pointer capture. Real capture is checked in the app workflow.
    surface.setPointerCapture = () => {};
    surface.releasePointerCapture = () => {};
    element.setPointerCapture = () => {};
    element.releasePointerCapture = () => {};
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, pointerId, pointerType, clientX: client.x, clientY: client.y }));
    await settle();
  }
  function lensAt(p: Point, scale: number) {
    const lens = target.querySelector<HTMLElement>('.magnifier');
    check(!!lens, 'Magnifier is visible while marking');
    const box = lens!.querySelector<SVGSVGElement>('.detail')!.viewBox.baseVal;
    check(near(box.x + box.width / 2, p.x) && near(box.y + box.height / 2, p.y), 'Magnifier centers the exact image point, not the finger or a clamped crop');
    check(near(box.width, 112 / (3 * scale)), 'Magnification is three times the displayed image scale');
    check(lens!.getAttribute('aria-hidden') === 'true' && getComputedStyle(lens!).pointerEvents === 'none', 'Lens neither intercepts input nor adds accessibility noise');
    const rect = lens!.getBoundingClientRect();
    check(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight, 'Lens stays within the viewport');
  }
  const hidden = () => check(!target.querySelector('.magnifier'), 'Magnifier hides when marking finishes or is cancelled');
  async function checkSwitch(surface: SVGSVGElement | HTMLElement, p: Point, scale: number) {
    enabled.set(false);
    await settle();
    hidden();
    const next = { x: p.x + 3.25, y: p.y + 4.75 };
    await pointer(surface, 'pointermove', next);
    hidden();
    enabled.set(true);
    await settle();
    lensAt(next, scale);
  }
  try {
    const additions: Point[] = [];
    const moves: Point[] = [];
    await replace(() => mount(AnchorEditor, { target, context: magnifierContext, props: {
      refImg: image, srcImg: image, anchors: [{ id: 1, ref: { x: 120, y: 90 }, src: null }],
      selectedAnchorId: 1, listExpanded: false, canApply: false,
      onadd: (_side: string, p: Point) => additions.push(p), onmove: (_id: number, _side: string, p: Point) => moves.push(p),
      onremove: () => {}, onclear: () => {}, onundo: () => {}, onselect: () => {}, ontogglelist: () => {}, onapply: () => {}
    } }));
    const frame = target.querySelector<HTMLElement>('[aria-label="Reference anchor canvas"]')!;
    const anchorScale = Math.min(frame.clientWidth / 800, frame.clientHeight / 600);
    await pointer(frame, 'pointerdown', { x: 317, y: 241 });
    lensAt({ x: 317, y: 241 }, anchorScale);
    await checkSwitch(frame, { x: 317, y: 241 }, anchorScale);
    check(additions.length === 0, 'New anchors are not committed before release');
    await pointer(frame, 'pointermove', { x: 339, y: 257 });
    lensAt({ x: 339, y: 257 }, anchorScale);
    await pointer(frame, 'pointerup', { x: 351, y: 269 });
    check(additions.length === 1 && near(additions[0].x, 351) && near(additions[0].y, 269), 'One anchor is committed at the release position');
    hidden();
    await pointer(frame, 'pointerdown', { x: 310, y: 220 });
    await pointer(frame, 'pointercancel', { x: 320, y: 230 });
    check(additions.length === 1, 'Cancelled placement creates no anchor');
    hidden();
    const handle = frame.querySelector<HTMLElement>('.anchor-handle')!;
    await pointer(frame, 'pointerdown', { x: 132, y: 99 }, 'touch', handle);
    lensAt({ x: 120, y: 90 }, anchorScale);
    await pointer(frame, 'pointermove', { x: 171, y: 128 });
    lensAt({ x: 159, y: 119 }, anchorScale);
    check(near(moves[0].x, 159) && near(moves[0].y, 119), 'Dragging preserves the grabbed offset and magnifies the marker, not the finger');
    await pointer(frame, 'pointerup', { x: 171, y: 128 });
    hidden();
    await pointer(frame, 'pointermove', { x: 1, y: 1 }, 'mouse');
    lensAt({ x: 1, y: 1 }, anchorScale);
    frame.dispatchEvent(new PointerEvent('pointerleave'));
    await settle();
    hidden();

    await replace(() => mount(RegionSelector, { target, context: magnifierContext, props: { image, region: null } }));
    let surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    await pointer(surface, 'pointerdown', { x: 121.25, y: 93.25 });
    lensAt({ x: 121.25, y: 93.25 }, surface.getScreenCTM()!.a);
    await checkSwitch(surface, { x: 121.25, y: 93.25 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointermove', { x: 491.25, y: 347.25 });
    lensAt({ x: 491.25, y: 347.25 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointerup', { x: 491.25, y: 347.25 });
    check(Number(target.querySelector('.selection')!.getAttribute('width')) === 371
      && Number(target.querySelector('.selection')!.getAttribute('height')) === 255, 'Magnifier does not change integer-enclosed rectangle coordinates');
    hidden();
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    lensAt({ x: 492.25, y: 347.25 }, surface.getScreenCTM()!.a);
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    hidden();

    await saveCalibration(file, { points: [{ x: 50, y: 40 }, { x: 650, y: 440 }], horizontal: 6, vertical: 4, unit: 'cm' });
    await replace(() => mount(MeasureView, { target, context: magnifierContext, props: { image, file, region: { x: 100, y: 80, width: 480, height: 320 }, onback: () => {} } }));
    for (let i = 0; i < 100 && !target.querySelector('.results'); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    check(!!target.querySelector('.results'), 'Measurement calibration loads');
    surface = target.querySelector<SVGSVGElement>('svg[role="application"]')!;
    await pointer(surface, 'pointerdown', { x: 183, y: 127 });
    lensAt({ x: 183, y: 127 }, surface.getScreenCTM()!.a);
    await checkSwitch(surface, { x: 183, y: 127 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointermove', { x: 207, y: 139 });
    lensAt({ x: 207, y: 139 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointerup', { x: 207, y: 139 });
    hidden();
    const zoom = target.querySelector<HTMLSelectElement>('select')!;
    zoom.value = '4';
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await pointer(surface, 'pointermove', { x: 301, y: 239 }, 'mouse');
    lensAt({ x: 301, y: 239 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointerdown', { x: 341, y: 251 });
    await pointer(surface, 'pointercancel', { x: 341, y: 251 });
    hidden();
    target.querySelector<HTMLButtonElement>('[aria-label="Redo calibration"]')!.click();
    await settle();
    await pointer(surface, 'pointerdown', { x: 151, y: 113 });
    lensAt({ x: 151, y: 113 }, surface.getScreenCTM()!.a);
    await checkSwitch(surface, { x: 151, y: 113 }, surface.getScreenCTM()!.a);
    await pointer(surface, 'pointerup', { x: 151, y: 113 });
    hidden();
    return 'PASS: shared on/off preference updates all marking tasks live; exact 3× image crops, touch placement/drag/release/cancellation across anchors, regions, calibration and measurement; grab offsets; edge positioning; cropped and zoomed images; keyboard refinement; inert accessible overlay';
  } finally {
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(url);
  }
}
