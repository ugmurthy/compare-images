import { mount, tick, unmount } from 'svelte';
import { unzipSync } from 'fflate';
import { downloadAlignedSources, downloadSourceImage, photoCaptureTime, prepareAlignedExport } from '../src/lib/alignedExport';
import { downloadHistoryGif } from '../src/lib/historyGif';
import HistoryView from '../src/components/HistoryView.svelte';
import type { HistoryEntry } from '../src/lib/history';

// Run against Vite in a disposable browser: await (await import('/tests/alignedExport.browser.ts')).testAlignedExport()
function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Independent JPEG APP1/TIFF fixture writer. The export reads real EXIF, not mocked timestamps.
function withExif(jpeg: Uint8Array, date: string, offset = '+00:00', subsecond = ''): File {
  const tags: [number, string][] = [[0x9003, date], [0x9011, offset]];
  if (subsecond) tags.push([0x9291, subsecond]);
  let next = 26 + 2 + tags.length * 12 + 4;
  const tiff = new Uint8Array(next + tags.reduce((sum, [, value]) => sum + value.length + 1, 0));
  const view = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint16(26, tags.length, true);
  tags.forEach(([tag, value], index) => {
    const position = 28 + index * 12;
    const bytes = new TextEncoder().encode(value + '\0');
    view.setUint16(position, tag, true);
    view.setUint16(position + 2, 2, true);
    view.setUint32(position + 4, bytes.length, true);
    if (bytes.length <= 4) tiff.set(bytes, position + 8);
    else {
      view.setUint32(position + 8, next, true);
      tiff.set(bytes, next);
      next += bytes.length;
    }
  });
  const segmentLength = tiff.length + 8;
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segmentLength >> 8, segmentLength & 255, 69, 120, 105, 102, 0, 0]), tiff, jpeg.slice(2)],
    'photo.jpeg', { type: 'image/jpeg', lastModified: 0 });
}

export async function alignedExportFixtures(): Promise<HistoryEntry[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 60;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'white';
  context.fillRect(0, 0, 80, 60);
  context.fillStyle = '#ff0000';
  context.fillRect(20, 10, 30, 20);
  const jpeg = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 1));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const sourceThumbnail = canvas.toDataURL();
  canvas.width = 120;
  canvas.height = 100;
  context.fillStyle = 'white';
  context.fillRect(0, 0, 120, 100);
  const referenceBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
  const reference = new File([referenceBlob], 'reference.png', { type: 'image/png' });
  const files = [withExif(bytes, '2024:01:02 10:00:00', '-08:00', '125'),
    withExif(bytes, '2024:01:02 12:00:00', '+02:00'),
    new File([jpeg], '00-undated.jpg', { type: 'image/jpeg', lastModified: Date.now() })];
  return files.map((file, index) => ({
    id: `fixture-${index}`, version: 2, projectName: 'Capture Study',
    // Deliberately reverse comparison-save order from capture order.
    createdAt: `2026-10-0${index + 1}T12:00:00Z`, note: 'Capture order differs from save order', parts: [],
    reference: { name: reference.name, width: 120, height: 100, file: reference, thumbnail: canvas.toDataURL() },
    source: { name: file.name, width: 60, height: 80, rotations: 1, file, thumbnail: sourceThumbnail },
    alignment: { method: index === 1 ? 'auto' : 'manual', homography: [1, 0, 12, 0, 1, 7, 0, 0, 1], inlierCount: 4 }
  }));
}

export async function testAlignedExport(): Promise<string> {
  const entries = await alignedExportFixtures();
  check(await photoCaptureTime(entries[0].source.file) === Date.parse('2024-01-02T18:00:00.125Z'), 'Capture date honors offset and subseconds');
  check(await photoCaptureTime(entries[2].source.file) === null, 'File modification date is not capture date');
  const jpeg = new Uint8Array(await entries[2].source.file.arrayBuffer());
  check(await photoCaptureTime(withExif(jpeg, '2024:02:30 12:00:00')) === null, 'Impossible capture dates are undated');
  check(await photoCaptureTime(new File(['broken'], 'bad.jpg')) === null, 'Unreadable EXIF is undated');
  const local = await photoCaptureTime(withExif(jpeg, '2024:01:02 10:00:00', ''));
  check(local === new Date(2024, 0, 2, 10).getTime(), 'Dates without offsets use the local clock');
  const plan = await prepareAlignedExport([...entries].reverse());
  check(plan.images.map((item) => item.entry.id).join(',') === 'fixture-0,fixture-1,fixture-2', 'Capture order, not save date, input order, filename, or raw camera clock');
  check(plan.images.map((item) => item.filename).join(',') === 'Capture Study_01.png,Capture Study_02.png,Capture Study_03.png', 'Project name replaces source basename with unique two-digit suffixes');
  check(plan.undated === 1 && plan.ignored === 0, 'Undated and ignored counts');

  const hundred = Array.from({ length: 100 }, (_, index) => {
    const timestamp = new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString().slice(0, 19).replace('T', ' ').replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1:$2:$3');
    const file = withExif(jpeg, timestamp);
    return { ...entries[0], id: String(index), source: { ...entries[0].source, file } };
  });
  for (const count of [98, 99, 100]) {
    const limited = await prepareAlignedExport(hundred.slice(0, count));
    check(limited.images.length === Math.min(99, count) && limited.ignored === Math.max(0, count - 99), `Limit boundary at ${count}`);
    check(limited.images[0].entry.id === String(count - 1) && limited.images.at(-1)!.entry.id === (count === 100 ? '1' : '0'), 'Newest selected before applying cap');
    check(limited.images.at(-1)!.filename === `Capture Study_${Math.min(99, count)}.png`, 'Suffix ends at 99, never 100');
  }
  const unsafe = { ...entries[0], projectName: 'Study/Phase\\2: detail.' };
  check((await prepareAlignedExport([unsafe])).images[0].filename === 'Study_Phase_2_ detail_01.png', 'Unsafe project characters and trailing dots are sanitized');
  check((await prepareAlignedExport([{ ...entries[0], projectName: 'Study.v2' }])).images[0].filename === 'Study.v2_01.png', 'Dots inside project names are preserved, not treated as extensions');

  const createURL = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  let exported: Blob | undefined;
  let downloads = 0;
  let downloadName = '';
  const progress: string[] = [];
  URL.createObjectURL = (blob) => {
    if (blob instanceof Blob) exported = blob;
    return createURL(blob);
  };
  HTMLAnchorElement.prototype.click = function () { downloads++; downloadName = this.download; };
  try {
    await downloadSourceImage(entries[0], false);
    check(downloads === 1 && downloadName === 'photo.jpeg', 'Single original keeps its filename');
    const original = new Uint8Array(await exported!.arrayBuffer());
    const expected = new Uint8Array(await entries[0].source.file.arrayBuffer());
    check(exported!.type === 'image/jpeg' && original.length === expected.length && original.every((byte, index) => byte === expected[index]), 'Original download preserves all bytes, including EXIF, without rotation or alignment');
    await downloadSourceImage(entries[0], true);
    check(downloads === 2 && downloadName === 'aligned_photo.png' && exported!.type === 'image/png', 'Single aligned JPEG uses original basename, aligned_ prefix, and correct PNG extension');
    const aligned = exported!;
    await downloadSourceImage({ ...entries[1], source: { ...entries[1].source, name: 'study.v2.png' } }, true);
    check(downloadName === 'aligned_study.v2.png', 'PNG keeps its extension and dots within basename');
    await downloadSourceImage({ ...entries[2], source: { ...entries[2].source, name: 'drawing' } }, true);
    check(downloadName === 'aligned_drawing.png', 'Extensionless source gets a PNG extension');
    const beforeZip = downloads;
    const result = await downloadAlignedSources(entries, (message) => progress.push(message));
    check(downloads === beforeZip + 1 && downloadName === 'Capture Study-aligned-sources.zip', 'One automatic project ZIP download');
    check(result.includes('3 aligned images') && result.includes('1 photo had no readable capture timestamp'), 'Completion reports count and undated fallback');
    check(progress.some((message) => message.includes('3 of 3')), 'Progress reaches final image');
    const archiveBytes = new Uint8Array(await exported!.arrayBuffer());
    check(new DataView(archiveBytes.buffer).getUint16(8, true) === 8, 'ZIP entries use DEFLATE compression');
    const files = unzipSync(archiveBytes);
    check(Object.keys(files).join(',') === 'Capture Study_01.png,Capture Study_02.png,Capture Study_03.png', 'Archive uses project-derived names for all ordered aligned sources');
    for (const png of [aligned, new Blob([files['Capture Study_01.png'].slice().buffer], { type: 'image/png' })]) {
      const bitmap = await createImageBitmap(png);
      try {
        check(bitmap.width === 120 && bitmap.height === 100, 'Output uses reference dimensions');
        const canvas = document.createElement('canvas');
        canvas.width = 120; canvas.height = 100;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const red = context.getImageData(50, 40, 1, 1).data;
        const white = context.getImageData(34, 22, 1, 1).data;
        check(red[0] > 220 && red[1] < 40 && red[2] < 40, 'Original red rectangle is rotated clockwise and translated by saved homography');
        check(white[0] > 220 && white[1] > 220 && white[2] > 220, 'Saved translation applied, not just rotation');
        check(context.getImageData(1, 1, 1, 1).data[3] === 0, 'Alignment border remains transparent in PNG');
      } finally { bitmap.close(); }
    }

    const cappedResult = await downloadAlignedSources(hundred, () => {});
    check(cappedResult.includes('1 entry beyond the 99-image limit was ignored'), 'Completion reports ignored entries');
    check(Object.keys(unzipSync(new Uint8Array(await exported!.arrayBuffer()))).length === 99, 'Actual archive excludes entries after 99');
    const beforeFailure = downloads;
    let failed = false;
    try { await downloadAlignedSources([{ ...entries[0], alignment: { ...entries[0].alignment, homography: [] } }], () => {}); }
    catch (error) { failed = (error as Error).message.includes('photo.jpeg'); }
    check(failed && downloads === beforeFailure, 'Bad alignment reports filename and does not download a partial archive');
    failed = false;
    try { await downloadSourceImage({ ...entries[0], alignment: { ...entries[0].alignment, homography: [] } }, true); }
    catch { failed = true; }
    check(failed && downloads === beforeFailure, 'Bad single alignment fails without downloading an image');
  } finally {
    URL.createObjectURL = createURL;
    HTMLAnchorElement.prototype.click = click;
  }
  return 'PASS: original source bytes, individual aligned PNGs and filenames, real EXIF capture timestamps, offsets/subseconds, undated fallback, 98/99/100 limit, names, compressed ZIP, auto-download, rotation/homography pixels, and error handling';
}

export async function testHistoryGif(): Promise<string> {
  const entries = (await alignedExportFixtures()).map((entry, index) => ({ ...entry,
    alignment: { ...entry.alignment, homography: [1, 0, 12 + index * 20, 0, 1, 7, 0, 0, 1] }
  }));
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
  async function wait(predicate: () => boolean) {
    for (let i = 0; i < 1000 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    check(predicate(), 'GIF export finishes');
    await tick();
  }
  async function verify(blob: Blob, redCenters: number[]) {
    check(blob.type === 'image/gif' && blob.size <= 4_000_000, 'GIF type and actual size budget');
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    try {
      await decoder.tracks.ready;
      check(decoder.tracks.selectedTrack!.frameCount === redCenters.length, 'One frame per selected aligned source');
      check(decoder.tracks.selectedTrack!.repetitionCount === Infinity, 'Progress GIF loops forever');
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 100;
      const context = canvas.getContext('2d')!;
      let duration = 0;
      for (const [frameIndex, x] of redCenters.entries()) {
        const { image } = await decoder.decode({ frameIndex });
        try {
          check(image.displayWidth === 120 && image.displayHeight === 100, 'Native reference aspect and small dimensions retained');
          check(image.duration >= 20000, 'Frame delays avoid browser clamping');
          duration += image.duration;
          context.drawImage(image, 0, 0);
          const red = context.getImageData(x, 40, 1, 1).data;
          const white = context.getImageData(x - 20, 40, 1, 1).data;
          check(red[0] > 220 && red[1] < 40 && red[2] < 40, `Frame ${frameIndex} follows capture/save chronology and saved rotation/homography`);
          check(white[0] > 220 && white[1] > 220 && white[2] > 220, 'Previous drawings are cleared, not blended into later frames');
          check(context.getImageData(1, 1, 1, 1).data.every((value) => value === 255), 'Transparent alignment borders become opaque white');
        } finally { image.close(); }
      }
      check(duration === 2_000_000, `Decoded cycle is exactly 2 seconds, got ${duration} microseconds`);
    } finally { decoder.close(); }
  }
  try {
    component = mount(HistoryView, { target, props: {
      // Another project must not leak into the selected project's GIF.
      entries: [...entries, { ...entries[0], id: 'other', projectName: 'Other project' }],
      async onopen() {}, async oncreate() {}, async ondelete() {}, onstart() {}
    } });
    await tick();
    const button = target.querySelector<HTMLButtonElement>('[aria-label="Download history GIF for Capture Study"]')!;
    button.click(); button.click(); await tick();
    check(button.disabled && button.getAttribute('aria-busy') === 'true', 'Busy state blocks duplicate exports');
    check([...target.querySelectorAll<HTMLButtonElement>('.entry-downloads button, .delete, aside button')].every((item) => item.disabled), 'History mutations and project switching disabled during export');
    await wait(() => !button.disabled);
    check(downloads.length === 1 && downloads[0].name === 'Capture Study-progress.gif', 'One project-named download from a double click');
    check(target.textContent!.includes('Used save dates for 1 image'), 'Missing capture date fallback is reported');
    // Capture chronology is fixture 1, fixture 0, then undated fixture 2 (save date), not input order.
    await verify(downloads[0].blob, [72, 52, 92]);
    await unmount(component); component = undefined;
    await downloadHistoryGif([entries[0]], new AbortController().signal, () => {});
    await verify(downloads.at(-1)!.blob, [52]);

    for (const count of [99, 100, 101]) {
      const many = Array.from({ length: count }, (_, index) => ({ ...entries[2], id: `many-${index}`,
        createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(),
        // Distinct endpoints verify that sampling does not simply truncate the newest entry.
        alignment: entries[index === 0 ? 0 : index === count - 1 ? 2 : 1].alignment
      }));
      const status = await downloadHistoryGif(many.reverse(), new AbortController().signal, () => {});
      const frames = Math.min(count, 100);
      await verify(downloads.at(-1)!.blob, Array.from({ length: frames }, (_, index) => index === 0 ? 52 : index === frames - 1 ? 92 : 72));
      check(status.includes('Evenly sampled') === (count > 100), 'Sampling is disclosed only above the 100-frame boundary');
    }
    const beforeFailure = downloads.length;
    let failed = false;
    try { await downloadHistoryGif([{ ...entries[0], alignment: { ...entries[0].alignment, homography: [] } }], new AbortController().signal, () => {}); }
    catch (cause) { failed = (cause as Error).message.includes('photo.jpeg'); }
    check(failed && downloads.length === beforeFailure, 'Invalid alignment names the source and never downloads a partial GIF');
    const cancelled = new AbortController();
    let aborted = false;
    try { await downloadHistoryGif(entries, cancelled.signal, (message) => { if (message.startsWith('Aligning')) cancelled.abort(); }); }
    catch (cause) { aborted = (cause as Error).name === 'AbortError'; }
    check(aborted && downloads.length === beforeFailure, 'Cancellation stops preparation and prevents late downloads');

    // Independent noisy photos exercise the compressed-size retry, not just a resolution limit.
    const canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 720;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(960, 720);
    const noisy: HistoryEntry[] = [];
    let seed = 923;
    for (let index = 0; index < 30; index++) {
      for (let i = 0; i < pixels.data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
      }
      context.putImageData(pixels, 0, 0);
      const file = new File([await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))], `noise-${index}.png`, { type: 'image/png' });
      noisy.push({ ...entries[2], id: `noise-${index}`, reference: { ...entries[2].reference, width: 960, height: 720 },
        source: { ...entries[2].source, file, rotations: 0, width: 960, height: 720 },
        alignment: { ...entries[2].alignment, homography: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
      });
    }
    await downloadHistoryGif(noisy, new AbortController().signal, () => {});
    const noise = downloads.at(-1)!.blob;
    check(noise.size <= 4_000_000, 'Large noisy histories stay under the actual 4 MB budget');
    const bitmap = await createImageBitmap(noise);
    try { check(bitmap.width <= 640 && bitmap.width / bitmap.height === 4 / 3, 'Large GIF retains reference aspect ratio without exceeding 640px'); }
    finally { bitmap.close(); }
    return `PASS: History GIF UI download, project scoping, duplicate-click prevention, capture/save chronology, independent rotation/homography/white-border pixels, exact 2-second looping playback for 1/3/99/100/101 entries, timeline endpoint sampling, errors, cancellation, and large noisy-image size budget. Three-image GIF: ${downloads[0].blob.size} bytes; noisy GIF: ${noise.size} bytes.`;
  } finally {
    URL.createObjectURL = createURL;
    HTMLAnchorElement.prototype.click = click;
    if (component) await unmount(component);
    target.remove();
  }
}
