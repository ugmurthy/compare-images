import { mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import PartsView from '../src/components/PartsView.svelte';
import { overlayGif } from '../src/lib/overlayGif';
import { partPairFixtures } from './parts.browser';

// Run in a disposable Chromium session against Vite:
// await (await import('/tests/overlayGif.browser.ts')).testOverlayGif()
export async function testOverlayGif(): Promise<string> {
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const fixture = await partPairFixtures();
  const target = document.createElement('div');
  document.body.append(target);
  let component: ReturnType<typeof mount> | undefined;
  const createURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  const blobs = new Map<string, Blob>();
  const downloads: { name: string; blob: Blob }[] = [];
  URL.createObjectURL = (blob) => {
    const url = createURL(blob);
    if (blob instanceof Blob) blobs.set(url, blob);
    return url;
  };
  HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, blob: blobs.get(this.href)! }); };
  async function wait(predicate: () => boolean, message: string) {
    for (let i = 0; i < 500 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    check(predicate(), message);
    await tick();
  }
  async function verify(blob: Blob, cropped: boolean) {
    check(blob.type === 'image/gif' && blob.size <= 4_000_000, 'GIF MIME type and size budget');
    // Decode with the browser's independent GIF decoder, not the encoder's helpers.
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    try {
      await decoder.tracks.ready;
      check(decoder.tracks.selectedTrack!.frameCount === 20, 'A complete cycle has 20 frames');
      check(decoder.tracks.selectedTrack!.repetitionCount === Infinity, 'The exported animation loops forever');
      const canvas = document.createElement('canvas');
      canvas.width = cropped ? 200 : 360;
      canvas.height = cropped ? 140 : 260;
      const ctx = canvas.getContext('2d')!;
      for (const [frameIndex, expected] of [[0, [255, 0, 0]], [5, [128, 128, 0]], [10, [0, 255, 0]], [15, [128, 128, 0]]] as const) {
        const { image } = await decoder.decode({ frameIndex });
        try {
          check(image.displayWidth === canvas.width && image.displayHeight === canvas.height, 'Native small dimensions and non-square crop aspect ratio');
          check(image.duration === 80000, '80 ms frames preserve the 1.6-second playback cycle');
          ctx.drawImage(image, 0, 0);
          const pixel = ctx.getImageData(cropped ? 5 : 65, cropped ? 5 : 45, 1, 1).data;
          check(expected.every((value, i) => Math.abs(value - pixel[i]) < 12), `Frame ${frameIndex} uses the correct crop and fade direction, not a static screenshot`);
          const border = ctx.getImageData(cropped ? 89 : 149, cropped ? 68 : 108, 1, 1).data;
          check([250, 245, 232].every((value, i) => Math.abs(value - border[i]) < 12), 'Transparent source pixels retain the reference throughout the fade');
        } finally { image.close(); }
      }
    } finally { decoder.close(); }
  }
  async function download() {
    const button = target.querySelector<HTMLButtonElement>('[aria-label="Download animation GIF"]')!;
    const count = downloads.length;
    button.click(); button.click();
    await tick();
    check(button.disabled && button.getAttribute('aria-busy') === 'true', 'Encoding exposes a busy state and blocks duplicate clicks');
    await wait(() => downloads.length > count, 'GIF download completes');
    check(downloads.length === count + 1, 'One GIF per click, even on a double-click');
    check(!!target.querySelector('[aria-label="Stop opacity animation"]'), 'Download leaves playback running');
    return downloads.at(-1)!;
  }
  try {
    component = mount(PartsView, { target, props: { reference: fixture.reference, aligned: fixture.aligned,
      region: fixture.region, sourceName: fixture.sourceFile.name, onback() {}, onnewregion() {}, onmeasure() {} } });
    await tick();
    check(!target.querySelector('[aria-label="Download animation GIF"]'), 'GIF export is only offered for overlay layout');
    target.querySelector<HTMLButtonElement>('[aria-label="Overlay"]')!.click(); await tick();
    target.querySelector<HTMLButtonElement>('[aria-label="Play opacity animation"]')!.click(); await tick();
    const part = await download();
    check(part.name === 'study.v2-part-overlay.gif', 'Part filename is recognizable and preserves basename dots');
    await verify(part.blob, true);
    await unmount(component);
    component = mount(App, { target }); await tick();
    for (const [label, file] of [['Reference', fixture.referenceFile], ['Source', fixture.sourceFile]] as const) {
      const input = target.querySelector<HTMLInputElement>(`[aria-label="${label} upload"] input`)!;
      const files = new DataTransfer(); files.items.add(file); input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await wait(() => !!target.querySelector('[aria-label="Overlay"]'), 'Whole-image comparison opens');
    target.querySelector<HTMLButtonElement>('[aria-label="Overlay"]')!.click(); await tick();
    target.querySelector<HTMLButtonElement>('[aria-label="Play opacity animation"]')!.click(); await tick();
    const whole = await download();
    check(whole.name === 'study.v2-overlay.gif', 'Whole-image filename differs from part export');
    await verify(whole.blob, false);
    // Independent noisy photos defeat compression; a fixed resolution alone cannot enforce the budget.
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = noiseCanvas.height = 960;
    const context = noiseCanvas.getContext('2d')!;
    const noise = context.createImageData(960, 960);
    let seed = 923;
    function fillNoise() {
      for (let i = 0; i < noise.data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        noise.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
      }
    }
    fillNoise(); context.putImageData(noise, 0, 0);
    const noisyReference = new Image();
    noisyReference.src = noiseCanvas.toDataURL(); await noisyReference.decode();
    fillNoise();
    const noisy = await overlayGif(noisyReference, noise, undefined, new AbortController().signal, () => {});
    check(noisy.size <= 4_000_000, 'Even incompressible large images respect the actual encoded size budget');
    const noisyImage = await createImageBitmap(noisy);
    check(noisyImage.width <= 640 && noisyImage.height === noisyImage.width, 'Large exports reduce dimensions while preserving aspect ratio');
    noisyImage.close();
    const cancelled = new AbortController(); cancelled.abort();
    let aborted = false;
    try { await overlayGif(fixture.reference, fixture.aligned, undefined, cancelled.signal, () => {}); }
    catch (error) { aborted = (error as Error).name === 'AbortError'; }
    check(aborted, 'An abandoned export cannot download later');
    return `PASS: whole and part UI downloads while playing, duplicate-click prevention, independently decoded crop/alpha/fade pixels, 20 × 80ms frames, infinite loop, cancellation, large noisy-image size budget. Whole ${whole.blob.size} bytes; part ${part.blob.size} bytes; noise ${noisy.size} bytes.`;
  } finally {
    URL.createObjectURL = createURL;
    HTMLAnchorElement.prototype.click = click;
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(fixture.reference.src);
  }
}
