import { mount, tick, unmount } from 'svelte';
import PartsView from '../src/components/PartsView.svelte';
import type { SavedPart } from '../src/lib/history';

export async function partPairFixtures() {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 260;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#dddddd';
  context.fillRect(0, 0, 360, 260);
  context.fillStyle = '#faf5e8';
  context.fillRect(60, 40, 200, 140);
  context.strokeStyle = '#777777';
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(160, 100, 65, 27, 0, 0, 2 * Math.PI);
  context.ellipse(160, 100, 15, 25, 0, 0, 2 * Math.PI);
  context.stroke();
  context.fillStyle = '#ff0000'; context.fillRect(64, 44, 8, 8);
  context.fillStyle = '#ffff00'; context.fillRect(246, 166, 8, 8);
  const referenceBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
  const referenceFile = new File([referenceBlob], 'reference.png', { type: 'image/png' });
  const reference = new Image();
  reference.src = URL.createObjectURL(referenceFile);
  await reference.decode();
  context.fillStyle = '#f2f4fa';
  context.fillRect(60, 40, 200, 140);
  context.strokeStyle = '#4b5368';
  context.beginPath();
  context.ellipse(155, 105, 68, 32, -0.1, 0, 2 * Math.PI);
  context.ellipse(155, 105, 18, 29, 0, 0, 2 * Math.PI);
  context.stroke();
  context.fillStyle = '#00ff00'; context.fillRect(64, 44, 8, 8);
  context.fillStyle = '#0000ff'; context.fillRect(246, 166, 8, 8);
  context.clearRect(140, 100, 10, 10);
  const aligned = context.getImageData(0, 0, 360, 260);
  const sourceBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
  const sourceFile = new File([sourceBlob], 'study.v2.jpg', { type: 'image/png' });
  const region = { x: 60, y: 40, width: 200, height: 140 };
  const parts: SavedPart[] = [
    { id: 'first', name: 'Other detail', note: '', region: { x: 0, y: 0, width: 40, height: 50 }, thumbnail: '' },
    { id: 'second', name: 'Eye study', note: 'Compare the width and curve.', region, thumbnail: '' }
  ];
  return { reference, referenceFile, sourceFile, aligned, region, parts };
}

// Run against Vite in a disposable browser:
// await (await import('/tests/parts.browser.ts')).testPartPairDownload()
export async function testPartPairDownload(): Promise<string> {
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const fixture = await partPairFixtures();
  const target = document.createElement('div');
  document.body.append(target);
  let component: ReturnType<typeof mount> | undefined;
  const createURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  const blobs = new Map<string, Blob>();
  const downloads: { filename: string; blob: Blob }[] = [];
  URL.createObjectURL = (blob) => {
    const url = createURL(blob);
    if (blob instanceof Blob) blobs.set(url, blob);
    return url;
  };
  HTMLAnchorElement.prototype.click = function () { downloads.push({ filename: this.download, blob: blobs.get(this.href)! }); };
  const props = { reference: fixture.reference, aligned: fixture.aligned, region: fixture.region,
    sourceName: fixture.sourceFile.name, parts: fixture.parts, selectedPart: fixture.parts[1],
    onback: () => {}, onmeasure: () => {}, onnewregion: () => {} };
  async function download(layout: string) {
    target.querySelector<HTMLButtonElement>(`[aria-label="${layout}"]`)!.click();
    await tick();
    const count = downloads.length;
    target.querySelector<HTMLButtonElement>('[aria-label="Download part image pair"]')!.click();
    for (let i = 0; i < 100 && downloads.length === count; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    await tick();
    check(downloads.length === count + 1, 'Each click downloads one combined image');
    return downloads.at(-1)!;
  }
  async function verifyPair(blob: Blob, stacked: boolean) {
    check(blob.type === 'image/png', 'Export is lossless PNG, regardless of source extension');
    const bitmap = await createImageBitmap(blob);
    try {
      check(bitmap.width === (stacked ? 200 : 404) && bitmap.height === (stacked ? 348 : 172), 'Both crops retain native resolution in the selected layout, with captions and a small seam');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const pixel = (x: number, y: number) => context.getImageData(x, y, 1, 1).data.join(',');
      check(pixel(5, 37) === '255,0,0,255' && pixel(190, 162) === '255,255,0,255', 'Reference uses the correct nonzero crop origin, orientation, and extent');
      const x = stacked ? 0 : 204;
      const y = stacked ? 208 : 32;
      check(pixel(x + 5, y + 5) === '0,255,0,255' && pixel(x + 190, y + 130) === '0,0,255,255', 'Aligned source is second (right or bottom), with the same crop origin and extent');
      check(pixel(x + 85, y + 65) === '255,255,255,255', 'Transparent alignment borders have a white background');
    } finally { bitmap.close(); }
  }
  try {
    component = mount(PartsView, { target, props });
    await tick();
    const side = await download('Side by side');
    check(side.filename === 'study.v2_02.png', 'Filename preserves source basename dots and uses the displayed saved-part number');
    await verifyPair(side.blob, false);
    const stacked = await download('Stack vertically');
    check(stacked.filename === 'study.v2_02.png', 'Layout changes do not change the part number');
    await verifyPair(stacked.blob, true);
    target.querySelector<HTMLButtonElement>('[aria-label="Overlay"]')!.click();
    await tick();
    check(!target.querySelector('[aria-label="Download part image pair"]'), 'The pair download is offered only in pair layouts');
    await unmount(component);
    component = mount(PartsView, { target, props: { ...props, selectedPart: null, sourceName: 'new/drawing' } });
    await tick();
    const unsaved = await download('Side by side');
    check(unsaved.filename === 'new_drawing_03.png', 'Unsaved selection uses the next part number, sanitizes unsafe characters, and supports an extensionless source');
    return 'PASS: one PNG per click; native crop pixels, side-by-side and stacked order/dimensions, transparent borders, source filename and saved/unsaved part numbering, overlay exclusion';
  } finally {
    URL.createObjectURL = createURL;
    HTMLAnchorElement.prototype.click = click;
    if (component) await unmount(component);
    target.remove();
    URL.revokeObjectURL(fixture.reference.src);
  }
}
