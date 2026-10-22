import { mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import { deleteHistory, listHistory, saveHistory, thumbnail, type HistoryEntry } from '../src/lib/history';
import { loadOpenCV } from '../src/lib/opencv';

export async function savedAlignmentFixtures(): Promise<HistoryEntry[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 360; canvas.height = 260;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff9ed'; context.fillRect(0, 0, 360, 260);
  let random = 42;
  for (let i = 0; i < 150; i++) {
    random = (random * 1664525 + 1013904223) >>> 0;
    const x = random % 340 + 10;
    random = (random * 1664525 + 1013904223) >>> 0;
    const y = random % 240 + 10;
    context.strokeStyle = `hsl(${i * 37 % 360} 35% 30%)`;
    context.beginPath(); context.arc(x, y, 3 + i % 9, 0, Math.PI * 2); context.stroke();
  }
  const source = new Image(); source.src = canvas.toDataURL(); await source.decode();
  canvas.width = 260; canvas.height = 360;
  context.translate(0, 360); context.rotate(-Math.PI / 2); context.drawImage(source, 0, 0);
  const sourceFile = new File([await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))], 'rotated-study.png', { type: 'image/png' });
  canvas.width = 420; canvas.height = 320;
  context.fillStyle = '#fff9ed'; context.fillRect(0, 0, 420, 320); context.drawImage(source, 12, 7);
  const referenceFile = new File([await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)))], 'reference.png', { type: 'image/png' });
  const reference = new Image(); reference.src = canvas.toDataURL(); await reference.decode();
  const anchors = [
    { id: 2, src: { x: 20, y: 30 }, ref: { x: 32, y: 37 } },
    { id: 4, src: { x: 300, y: 40 }, ref: { x: 312, y: 47 } },
    { id: 7, src: { x: 310, y: 220 }, ref: { x: 322, y: 227 } },
    { id: 9, src: { x: 30, y: 200 }, ref: { x: 42, y: 207 } },
    { id: 12, src: { x: 170, y: 130 }, ref: { x: 182, y: 137 } }
  ];
  return ['manual', 'auto', 'legacy'].map((kind, index) => ({
    id: `saved-alignment-${kind}`, version: 2, projectName: `${kind} alignment study`, createdAt: `2026-10-${10 + index}T12:00:00Z`, note: '',
    reference: { name: referenceFile.name, width: 420, height: 320, file: referenceFile, thumbnail: thumbnail(reference) },
    source: { name: sourceFile.name, width: 360, height: 260, rotations: 1, file: sourceFile, thumbnail: thumbnail(source) },
    alignment: { method: kind === 'auto' ? 'auto' : 'manual', homography: [1, 0, kind === 'auto' ? 19 : 12, 0, 1, 7, 0, 0, 1], inlierCount: 5,
      ...(kind === 'manual' ? { anchors } : {}) },
    parts: [{ id: 'detail', name: 'Drawing detail', note: '', region: { x: 50, y: 40, width: 160, height: 120 }, thumbnail: thumbnail(reference, { x: 50, y: 40, width: 160, height: 120 }) }]
  }));
}

// Run against Vite in a disposable browser session:
// await (await import('/tests/savedAlignment.browser.ts')).testSavedAlignment()
export async function testSavedAlignment(): Promise<string> {
  const fixtures = await savedAlignmentFixtures();
  const target = document.createElement('div'); document.body.append(target);
  let app: ReturnType<typeof mount> | undefined;
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const find = (name: string) => [...target.querySelectorAll<HTMLButtonElement>('button')].find((button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name);
  async function wait(predicate: () => boolean, message: string) {
    for (let i = 0; i < 300 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    check(predicate(), message); await tick();
  }
  async function click(name: string) {
    const button = find(name); check(!!button && !button.disabled, `${name} is available`);
    button!.click(); await tick();
  }
  async function open(kind: string) {
    await click('History');
    await wait(() => !!target.querySelector('.project-text'), 'History loaded');
    [...target.querySelectorAll<HTMLButtonElement>('aside button')].find((button) => button.querySelector('strong')?.textContent === `${kind} alignment study`)!.click();
    await tick();
    await click('Open comparison');
    await wait(() => !!find('Edit anchors'), 'Saved comparison restored');
    check(!find('Auto align') && !find('Manual align'), 'Reopened comparison hides alignment choices');
    check(!!target.querySelector('[aria-label="Saved part navigation"]'), 'Saved parts remain available');
  }
  async function save(project: string) {
    await click('Save comparison');
    const input = target.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    input.value = project; input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    target.querySelector<HTMLButtonElement>('[role="dialog"] .save-actions button.primary')!.click();
    await wait(() => !target.querySelector('[role="dialog"]'), 'Comparison saved');
  }
  try {
    for (const fixture of fixtures) await saveHistory(fixture);
    await loadOpenCV();
    app = mount(App, { target }); await tick();
    await open('manual');
    await click('Next part');
    await wait(() => !!find('Back to whole image'), 'Saved part opens');
    await click('Back to whole image');
    await click('Edit anchors');
    check(target.querySelectorAll('.anchor-handle').length === 10, 'All five pairs appear before changes');
    await click('Point list');
    for (const anchor of fixtures[0].alignment.anchors!) {
      const row = find(`Select point ${anchor.id}`)!.parentElement!;
      check(row.textContent?.includes(`${anchor.ref.x}, ${anchor.ref.y}`) === true && row.textContent?.includes(`${anchor.src.x}, ${anchor.src.y}`) === true, 'Both original-image coordinates are restored');
      const image = target.querySelector<HTMLImageElement>('[alt="Source anchors"]')!.getBoundingClientRect();
      const marker = target.querySelector<HTMLElement>(`[aria-label="Source anchor ${anchor.id}"]`)!.getBoundingClientRect();
      check(Math.abs(marker.x + marker.width / 2 - (image.x + anchor.src.x / 360 * image.width)) < 2, 'Source anchors appear at the correct coordinates on the rotated original, not the aligned image');
    }
    await click('Cancel');
    check(!find('Auto align') && !!find('Edit anchors'), 'Cancel keeps saved alignment and compact controls');
    await click('Edit anchors'); await click('Remove point 2');
    check(JSON.stringify((await listHistory()).find((entry) => entry.id === fixtures[0].id)?.alignment.anchors) === JSON.stringify(fixtures[0].alignment.anchors), 'Editing does not mutate saved anchors');
    await click('Apply manual alignment');
    await wait(() => !!find('Save comparison') && !find('Save comparison')!.disabled, 'Edited anchors realign');
    await save(fixtures[0].projectName);
    const edited = (await listHistory()).find((entry) => entry.id !== fixtures[0].id && entry.projectName === fixtures[0].projectName)!;
    check(edited.alignment.anchors?.map((anchor) => anchor.id).join(',') === '4,7,9,12', 'New save retains the applied anchors');
    await open('auto'); await click('Edit anchors');
    check(!!find('Auto align') && !!find('Manual align') && !target.querySelector('.anchor-editor'), 'Saved automatic alignment offers both realignment methods');
    await click('Manual align');
    check(target.querySelectorAll('.anchor-handle').length === 0, 'Auto alignment does not inherit manual anchors from another comparison');
    async function place(side: 'Reference' | 'Source', x: number, y: number) {
      const frame = target.querySelector<HTMLElement>(`[aria-label="${side} anchor canvas"]`)!;
      const image = frame.querySelector('img')!.getBoundingClientRect();
      const event = { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: image.left + image.width * x, clientY: image.top + image.height * y };
      const capture = frame.setPointerCapture;
      frame.setPointerCapture = () => {};
      try {
        frame.dispatchEvent(new PointerEvent('pointerdown', event));
        frame.dispatchEvent(new PointerEvent('pointerup', event));
      } finally { frame.setPointerCapture = capture; }
      await tick();
    }
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]) await place('Reference', x, y);
    await place('Source', 0.25, 0.25);
    check(!!find('Source anchor 1') && !find('Source anchor 4'), 'After batching reference points, source starts at point 1, not the last selected reference');
    await place('Reference', 0.5, 0.5);
    await place('Source', 0.75, 0.25);
    check(!!find('Source anchor 2') && !find('Source anchor 5'), 'Returning to source continues with its next missing point');
    await place('Source', 0.75, 0.75);
    await place('Source', 0.25, 0.75);
    await place('Source', 0.5, 0.5);
    check(!find('Apply manual alignment')!.disabled && target.querySelectorAll('.anchor-handle').length === 10, 'Batch placement completes all five pairs');
    await click('Clear all');
    await place('Source', 0.25, 0.25);
    await place('Source', 0.75, 0.25);
    await place('Reference', 0.2, 0.2);
    check(!!find('Reference anchor 1') && !find('Reference anchor 2'), 'Source-first batch placement also pairs from the first missing point');
    await open('auto'); await click('Edit anchors'); await click('Auto align');
    await wait(() => !!find('Save comparison') && !find('Save comparison')!.disabled, 'Auto runs again instead of showing cached alignment');
    await save(fixtures[1].projectName);
    const automatic = (await listHistory()).find((entry) => entry.id !== fixtures[1].id && entry.projectName === fixtures[1].projectName)!;
    check(Math.abs(automatic.alignment.homography[2] - 12) < 1 && !automatic.alignment.anchors, 'Auto recomputes the transformation and saves no manual anchors');
    await open('legacy'); await click('Edit anchors');
    check(target.textContent?.includes('older comparison did not save its anchor points') === true, 'Legacy manual entries explain missing historical anchors');
    await click('Cancel');
    check(!!find('Edit anchors') && !!target.querySelector('[aria-label="Saved part navigation"]'), 'Legacy alignment remains usable after cancel');
    for (const kind of ['manual', 'auto', 'legacy']) {
      const previous = (await listHistory()).find((entry) => entry.projectName === `${kind} alignment study`)!;
      await click('History');
      [...target.querySelectorAll<HTMLButtonElement>('aside button')].find((button) => button.querySelector('strong')?.textContent === previous.projectName)!.click();
      await tick();
      await click(`New comparison in ${previous.projectName} using existing reference`);
      await wait(() => !!target.querySelector('[aria-label="Source upload"] input'), 'New comparison asks for a source');
      const input = target.querySelector<HTMLInputElement>('[aria-label="Source upload"] input')!;
      const files = new DataTransfer(); files.items.add(previous.reference.file);
      input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => !!find('Manual align') || !!find('Apply manual alignment'), 'New source loaded');
      if (!previous.alignment.anchors) await click('Manual align');
      const anchors = previous.alignment.anchors ?? [];
      check(target.querySelectorAll('.anchor-handle').length === anchors.length, 'Only the latest comparison’s reference anchors are reused');
      check(!target.querySelector('button[aria-label^="Source anchor "]'), 'Previous source points are not reused');
      check(find('Apply manual alignment')!.disabled, 'Reused reference anchors still require new source points');
      await click('Point list');
      for (const anchor of anchors) {
        const row = find(`Select point ${anchor.id}`)!.parentElement!;
        check(row.textContent?.includes(`${anchor.ref.x}, ${anchor.ref.y}`) === true && row.querySelectorAll('.missing').length === 1, 'Reference IDs and coordinates are retained with missing source points');
      }
      if (anchors.length) {
        const first = anchors[0];
        await click(`Select point ${first.id}`);
        find(`Select point ${first.id}`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await tick();
        check(find(`Select point ${first.id}`)!.parentElement!.textContent?.includes(`${first.ref.x + 1}, ${first.ref.y}`) === true, 'Reused reference points remain editable');
        check(JSON.stringify((await listHistory()).find((entry) => entry.id === previous.id)?.alignment.anchors) === JSON.stringify(anchors), 'Editing reused points leaves the previous comparison unchanged');
        await click('Cancel'); await click('Rotate source image 90 degrees clockwise');
        await wait(() => !find('Rotate source image 90 degrees clockwise')!.disabled, 'New source rotated');
        await click('Manual align');
        check(target.querySelectorAll('.anchor-handle').length === anchors.length, 'Rotating the new source preserves reference anchors');
        await click('Clear all');
        check(target.querySelectorAll('.anchor-handle').length === 0, 'Reused points can be cleared');
      }
    }
    return 'PASS: saved alignment restoration and resave, auto realignment, legacy compatibility, and new comparisons reuse editable reference-only anchors from the latest entry without mutating history';
  } finally {
    if (app) await unmount(app);
    target.remove();
    for (const entry of await listHistory()) if (fixtures.some((fixture) => fixture.projectName === entry.projectName)) await deleteHistory(entry.id);
  }
}
