<script lang="ts">
  import { onDestroy, setContext, tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import {
    alignImages,
    alignImagesManually,
    loadOpenCV,
    onStatus,
    restoreAlignment
  } from './lib/opencv';
  import type { AlignResult, CvState } from './lib/opencv';
  import { deleteHistory, exportHistory, importHistory, listHistory, saveHistory, thumbnail } from './lib/history';
  import Icon from './components/Icon.svelte';
  import type { HistoryEntry, ImportSummary, SavedPart } from './lib/history';
  import { completeAnchors } from './lib/manualAnchors';
  import type { ManualAnchor, Point } from './lib/manualAnchors';
  import AnchorEditor from './components/AnchorEditor.svelte';
  import CompareView from './components/CompareView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import StorageStatus from './components/StorageStatus.svelte';
  import ThemeSelect from './components/ThemeSelect.svelte';
  import { magnifierPreferenceContext } from './components/Magnifier.svelte';
  import NotePreview from './components/NotePreview.svelte';
  import PartsView from './components/PartsView.svelte';
  import MeasureView from './components/MeasureView.svelte';
  import type { Region } from './lib/region';
  import ImageDrop from './components/ImageDrop.svelte';
  import type { ComparisonMode } from './components/ModeSwitch.svelte';

  let { account }: { account?: Snippet } = $props();

  const magnifierPreference = $state({ enabled: true });
  try {
    magnifierPreference.enabled = localStorage.getItem('compare-sketch-magnifier') !== 'off';
  } catch { /* Magnifier still works when browser storage is unavailable. */ }
  setContext(magnifierPreferenceContext, magnifierPreference);
  $effect(() => {
    try { localStorage.setItem('compare-sketch-magnifier', magnifierPreference.enabled ? 'on' : 'off'); }
    catch { /* Keep the selected preference for this session. */ }
  });

  let refFile: File | null = $state(null);
  let srcFile: File | null = $state(null);
  let refUrl = $state('');
  let srcUrl = $state('');
  let refImg: HTMLImageElement | null = $state(null);
  let srcImg: HTMLImageElement | null = $state(null);
  let cvState = $state<CvState>('idle');
  let comparisonMode = $state<ComparisonMode>('visual');
  let processingMode: 'manual' | 'auto' | null = $state(null);
  let manualResult = $state<AlignResult | null>(null);
  let autoResult = $state<AlignResult | null>(null);
  let manualEditing = $state(true);
  let manualAnchors: ManualAnchor[] = $state([]);
  let selectedManualAnchorId: number | null = $state(null);
  let anchorListExpanded = $state(false);
  let nextManualAnchorId = $state(1);
  let viewMode = $state(defaultViewMode());
  let selectedRegion: Region | null = $state(null);
  let showingParts = $state(false);
  let measuring = $state(false);
  let measurementRegion = $state<Region | null>(null);
  let overlayOpacity = $state(0.5);
  let overlayPlaying = $state(false);
  let sourceRotating = $state(false);
  let sourceRotations = $state(0);
  let historyOpen = $state(false);
  let historyEntries: HistoryEntry[] = $state([]);
  let currentEntry: HistoryEntry | null = $state(null);
  let selectedPartId = $state('');
  let savePanel = $state(false);
  let moreOpen = $state(false);
  let moreButton: HTMLButtonElement | undefined = $state();
  let moreMenu: HTMLDivElement | undefined = $state();
  let menuOpensRight = $state(false);
  let replaceRefInput: HTMLInputElement | undefined = $state();
  let replaceSrcInput: HTMLInputElement | undefined = $state();
  let savingPart = $state(false);
  let saveDialog: HTMLDivElement = $state()!;
  let returnFocus: HTMLElement | null = null;
  let projectName = $state('');
  let draftProjectName = $state('');
  let entryNote = $state('');
  let partName = $state('');
  let partNote = $state('');
  let saving = $state(false);
  let exporting = $state(false);
  let importing = $state(false);
  let importSummary = $state<ImportSummary | null>(null);
  let importInput: HTMLInputElement = $state()!;
  let statusMsg = $state('');
  let errorMsg = $state('');
  let overlayAnimationFrame: number | null = null;

  const OVERLAY_ANIMATION_DURATION = 1600;

  function defaultViewMode() {
    return window.matchMedia('(max-width: 719px)').matches ? 'stacked' : 'side-by-side';
  }

  let completeManualAnchors = $derived(completeAnchors(manualAnchors));
  let selectedCount = $derived((refImg ? 1 : 0) + (srcImg ? 1 : 0));
  let activeResult = $derived(comparisonMode === 'manual' ? manualResult : comparisonMode === 'auto' ? autoResult : null);
  let savedParts = $derived.by(() => currentEntry && currentEntry.alignment.method === comparisonMode ? currentEntry.parts : []);
  let selectedPartIndex = $derived(savedParts.findIndex((part) => part.id === selectedPartId));
  let selectedPart = $derived(savedParts[selectedPartIndex] ?? null);
  let matchingProjects = $derived([...new Set(historyEntries.filter((entry) => entry.reference.name === refFile?.name).map((entry) => entry.projectName))]);
  let view = $derived<'compare' | 'measure' | 'history'>(historyOpen ? 'history' : measuring && refImg ? 'measure' : 'compare');
  let editingAnchors = $derived(comparisonMode === 'manual' && manualEditing);
  let savedHere = $derived(!!currentEntry && currentEntry.alignment.method === comparisonMode);
  let canSelectParts = $derived(!!activeResult && comparisonMode !== 'visual');
  let nextHint = $derived.by(() => {
    if (processingMode) return processingMode === 'auto' ? 'Finding matching features in both images…' : 'Applying your anchor points…';
    if (comparisonMode === 'visual') return 'Showing the originals. Align them — automatically or with anchor points — to overlay accurately and compare parts.';
    if (!activeResult) return comparisonMode === 'auto' ? 'Automatic alignment did not find a match. Try Manual align with anchor points.' : 'Apply at least four anchor pairs to align.';
    if (viewMode === 'overlay') return 'Drag the opacity slider or press Play to flick between reference and source. Switch to side by side to select a part.';
    if (!selectedRegion) return 'Drag a rectangle on the reference to select a part you want to study closely.';
    return 'Part selected — open Compare parts to study it, or drag again to change the selection.';
  });
  let runtimeLabel = $derived(
    cvState === 'ready' ? 'OpenCV ready' : cvState === 'loading' ? 'Preparing OpenCV' : cvState === 'error' ? 'OpenCV needs retry' : 'OpenCV pending'
  );

  let unsubscribeStatus: (() => void) | null = null;
  if (!unsubscribeStatus) {
    unsubscribeStatus = onStatus((message) => statusMsg = message);
  }

  onDestroy(() => {
    if (overlayAnimationFrame !== null) cancelAnimationFrame(overlayAnimationFrame);
    if (refUrl) URL.revokeObjectURL(refUrl);
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    unsubscribeStatus?.();
  });

  $effect(() => {
    if (cvState === 'idle') loadCv();
  });

  void listHistory().then((entries) => historyEntries = entries).catch((error) => errorMsg = `Could not load history: ${error.message}`);

  $effect(() => {
    // A different alignment/image pair invalidates its pixel selection.
    activeResult;
    refImg;
    selectedRegion = null;
    showingParts = false;
  });

  function compareParts() {
    if (!selectedRegion || !activeResult) return;
    selectedPartId = savedParts.find((part) => part.region.x === selectedRegion?.x && part.region.y === selectedRegion?.y && part.region.width === selectedRegion?.width && part.region.height === selectedRegion?.height)?.id ?? '';
    stopOverlayAnimation();
    showingParts = true;
    window.scrollTo(0, 0);
  }

  function openMeasurement(region: Region | null = null) {
    stopOverlayAnimation();
    measurementRegion = region;
    measuring = true;
    window.scrollTo(0, 0);
  }

  async function closeMeasurement(focus = true) {
    measuring = false;
    historyEntries = await listHistory();
    await tick();
    if (focus) document.querySelector<HTMLButtonElement>(showingParts ? '[data-focus="measure-part"]' : '#nav-measure')?.focus();
  }

  async function closeParts() {
    showingParts = false;
    await tick();
    document.querySelector<HTMLButtonElement>('[data-focus="compare-parts"]')?.focus();
  }

  function goCompare() {
    historyOpen = false;
    if (measuring) void closeMeasurement(false).catch((error) => errorMsg = error.message);
  }

  async function goMeasure() {
    historyOpen = false;
    if (!refImg) {
      measuring = false;
      await tick();
      document.querySelector<HTMLInputElement>('[aria-label="Reference upload"] input')?.focus();
      return;
    }
    if (!measuring) openMeasurement(showingParts ? selectedRegion : null);
  }

  function goHistory() {
    historyOpen = true;
    window.scrollTo(0, 0);
  }

  function chooseAlignment(mode: ComparisonMode) {
    if (processingMode) return;
    if (mode === 'visual') { selectMode('visual'); return; }
    if (mode === 'auto') {
      selectMode('auto');
      if (!autoResult) void processImages('auto');
      return;
    }
    selectMode('manual');
    manualEditing = !manualResult;
  }

  function cancelAnchors() {
    if (manualResult) manualEditing = false;
    else selectMode('visual');
  }

  async function toggleMore() {
    moreOpen = !moreOpen;
    if (moreOpen) {
      menuOpensRight = (moreButton?.getBoundingClientRect().left ?? Infinity) < 260;
      await tick();
      moreMenu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }

  function closeMore(focus = true) {
    if (!moreOpen) return;
    moreOpen = false;
    if (focus) moreButton?.focus();
  }

  function menuKeydown(event: KeyboardEvent) {
    const items = [...(moreMenu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); closeMore(); }
    else if (event.key === 'Tab') closeMore(false);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus();
    }
  }

  function windowPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (moreOpen && !moreMenu?.contains(target) && !moreButton?.contains(target)) closeMore(false);
  }

  function openSavedPart(part: SavedPart) {
    selectedPartId = part.id;
    selectedRegion = part.region;
    stopOverlayAnimation();
    showingParts = true;
    window.scrollTo(0, 0);
  }

  function adjacentPart(step: number) {
    const part = savedParts[selectedPartIndex + step];
    if (part) openSavedPart(part);
  }

  async function loadCv() {
    if (cvState === 'loading' || cvState === 'ready') return;
    cvState = 'loading';
    errorMsg = '';
    try {
      await loadOpenCV();
      cvState = 'ready';
      statusMsg = 'Ready to compare.';
    } catch (error) {
      cvState = 'error';
      errorMsg = `Failed to load OpenCV.js: ${(error as Error).message}`;
    }
  }

  function loadSelectedImage(file: File, side: 'ref' | 'src') {
    const previousUrl = side === 'ref' ? refUrl : srcUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (side === 'ref') refImg = img;
      else srcImg = img;
    };
    img.onerror = () => {
      errorMsg = `Could not read the ${side === 'ref' ? 'reference' : 'source'} image.`;
      if (side === 'ref') refImg = null;
      else srcImg = null;
    };
    img.src = url;

    if (side === 'ref') {
      draftProjectName = '';
      refFile = file;
      refUrl = url;
      refImg = null;
    } else {
      srcFile = file;
      srcUrl = url;
      srcImg = null;
      sourceRotations = 0;
    }
    resetComparisons();
    resetManualAnchors();
  }

  function handleCompactFile(event: Event, side: 'ref' | 'src') {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file?.type.startsWith('image/')) loadSelectedImage(file, side);
  }

  async function rotateSource() {
    if (!srcImg || sourceRotating) return;
    sourceRotating = true;
    errorMsg = '';
    statusMsg = 'Rotating source image…';
    await waitForPaint();

    try {
      const { url, image } = await rotateImage(srcImg);
      if (srcUrl) URL.revokeObjectURL(srcUrl);
      srcUrl = url;
      srcImg = image;
      sourceRotations = (sourceRotations + 1) % 4;
      resetComparisons();
      resetManualAnchors();
      statusMsg = 'Source rotated 90° clockwise. Ready to compare.';
    } catch (error) {
      errorMsg = `Could not rotate source: ${(error as Error).message}`;
    } finally {
      sourceRotating = false;
    }
  }

  function readImage(file: File): Promise<{ url: string; image: HTMLImageElement }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ url, image });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
      image.src = url;
    });
  }

  async function rotateImage(image: HTMLImageElement): Promise<{ url: string; image: HTMLImageElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext('2d')!;
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode the rotated image')), 'image/png');
    });
    return readImage(new File([blob], 'rotated.png', { type: 'image/png' }));
  }

  function resetComparisons() {
    stopOverlayAnimation();
    manualResult = null;
    autoResult = null;
    manualEditing = true;
    currentEntry = null;
    selectedPartId = '';
    savePanel = false;
  }

  function resetManualAnchors() {
    manualAnchors = [];
    selectedManualAnchorId = null;
    anchorListExpanded = false;
    nextManualAnchorId = 1;
  }

  function clearAll() {
    measuring = false;
    if (refUrl) URL.revokeObjectURL(refUrl);
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    refFile = null;
    srcFile = null;
    refUrl = '';
    srcUrl = '';
    refImg = null;
    srcImg = null;
    sourceRotations = 0;
    draftProjectName = '';
    comparisonMode = 'visual';
    viewMode = defaultViewMode();
    overlayOpacity = 0.5;
    errorMsg = '';
    statusMsg = cvState === 'ready' ? 'Ready to compare.' : statusMsg;
    resetComparisons();
    resetManualAnchors();
  }

  function selectMode(mode: ComparisonMode) {
    stopOverlayAnimation();
    comparisonMode = mode;
    errorMsg = '';
    viewMode = defaultViewMode();
  }

  function selectViewMode(mode: string) {
    if (mode !== 'overlay') stopOverlayAnimation();
    viewMode = mode;
  }

  function startOverlayAnimation() {
    if (overlayPlaying) return;
    overlayPlaying = true;
    overlayOpacity = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const progress = ((now - startedAt) % OVERLAY_ANIMATION_DURATION) / OVERLAY_ANIMATION_DURATION;
      overlayOpacity = (1 - Math.cos(progress * Math.PI * 2)) / 2;
      overlayAnimationFrame = requestAnimationFrame(animate);
    };

    overlayAnimationFrame = requestAnimationFrame(animate);
  }

  function stopOverlayAnimation() {
    if (overlayAnimationFrame !== null) cancelAnimationFrame(overlayAnimationFrame);
    overlayAnimationFrame = null;
    overlayPlaying = false;
  }

  function waitForPaint(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function noteManualAnchorChange() {
    manualResult = null;
    currentEntry = null;
    statusMsg = completeManualAnchors.length >= 4
      ? 'Anchor points ready. Apply manual alignment when satisfied.'
      : 'Add at least four complete point pairs.';
  }

  function addManualAnchor(side: 'ref' | 'src', point: Point) {
    const selected = manualAnchors.find((anchor) => anchor.id === selectedManualAnchorId);
    const target = selected?.[side] === null
      ? selected
      : manualAnchors.find((anchor) => anchor[side] === null);

    if (target) {
      manualAnchors = manualAnchors.map((anchor) => anchor.id === target.id ? { ...anchor, [side]: point } : anchor);
      selectedManualAnchorId = target.id;
    } else {
      const id = nextManualAnchorId++;
      manualAnchors = [...manualAnchors, { id, ref: side === 'ref' ? point : null, src: side === 'src' ? point : null }];
      selectedManualAnchorId = id;
    }
    noteManualAnchorChange();
  }

  function moveManualAnchor(id: number, side: 'ref' | 'src', point: Point) {
    const img = side === 'ref' ? refImg : srcImg;
    if (!img) return;
    const clamped = {
      x: Math.min(img.naturalWidth, Math.max(0, point.x)),
      y: Math.min(img.naturalHeight, Math.max(0, point.y))
    };
    manualAnchors = manualAnchors.map((anchor) => anchor.id === id ? { ...anchor, [side]: clamped } : anchor);
    selectedManualAnchorId = id;
    noteManualAnchorChange();
  }

  function removeManualAnchor(id: number) {
    manualAnchors = manualAnchors.filter((anchor) => anchor.id !== id);
    if (selectedManualAnchorId === id) selectedManualAnchorId = null;
    noteManualAnchorChange();
  }

  function undoManualAnchor() {
    const last = manualAnchors.at(-1);
    if (last) removeManualAnchor(last.id);
  }

  function clearManualAnchors() {
    resetManualAnchors();
    noteManualAnchorChange();
  }

  async function processImages(method: 'manual' | 'auto') {
    if (!refImg || !srcImg || cvState !== 'ready' || processingMode) return;
    if (method === 'manual' && completeManualAnchors.length < 4) return;
    processingMode = method;
    errorMsg = '';
    statusMsg = method === 'manual' ? 'Applying anchor alignment…' : 'Detecting matching features…';
    await waitForPaint();

    try {
      const refData = imageDataFromImg(refImg);
      const srcData = imageDataFromImg(srcImg);
      let result: AlignResult;

      if (method === 'manual') {
        result = await alignImagesManually(refData, srcData, completeManualAnchors);
      } else {
        result = await alignImages(refData, srcData);
      }

      if (method === 'manual') {
        manualResult = result;
        manualEditing = false;
        statusMsg = `Manual alignment complete · ${result.inlierCount} anchor inliers.`;
      } else {
        autoResult = result.method === 'auto' ? result : null;
        statusMsg = result.method === 'auto'
          ? `Auto alignment complete · ${result.inlierCount} feature inliers.`
          : 'Automatic alignment could not find a reliable transformation. Try Manual anchors for rotated, cropped, or photo-to-drawing comparisons.';
      }
      if (result.method !== 'none') {
        if (currentEntry?.alignment.method === method) currentEntry = null;
      }
      viewMode = defaultViewMode();
    } catch (error) {
      errorMsg = `${method === 'manual' ? 'Manual' : 'Automatic'} alignment failed: ${(error as Error).message}`;
    } finally {
      processingMode = null;
    }
  }

  function showSavePanel(part = false) {
    returnFocus = document.activeElement as HTMLElement;
    savingPart = part;
    projectName = currentEntry?.projectName ?? (draftProjectName || refFile?.name.replace(/\.[^.]+$/, '') || '');
    entryNote = '';
    partName = '';
    partNote = '';
    savePanel = true;
    void tick().then(() => saveDialog?.querySelector<HTMLElement>('input')?.focus());
  }

  function closeSavePanel() {
    savePanel = false;
    void tick().then(() => returnFocus?.focus());
  }

  function dialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); closeSavePanel(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...saveDialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function newEntry(): HistoryEntry {
    if (!activeResult || !refFile || !srcFile || !refImg || !srcImg || activeResult.method === 'none') throw new Error('Align images before saving');
    const matchingProject = historyEntries.find((entry) => entry.projectName === projectName.trim());
    if (matchingProject && matchingProject.reference.name !== refFile.name) throw new Error('This project uses another reference filename');
    return {
      id: crypto.randomUUID(), version: 2, projectName: projectName.trim(), createdAt: new Date().toISOString(), note: entryNote,
      reference: { name: refFile.name, width: refImg.naturalWidth, height: refImg.naturalHeight, file: refFile, thumbnail: thumbnail(refImg) },
      source: { name: srcFile.name, width: srcImg.naturalWidth, height: srcImg.naturalHeight, rotations: sourceRotations, file: srcFile, thumbnail: thumbnail(srcImg) },
      alignment: { method: activeResult.method, homography: [...activeResult.homography], inlierCount: activeResult.inlierCount },
      parts: []
    };
  }

  async function saveComparison() {
    if (!projectName.trim() || saving) return;
    saving = true;
    try {
      const entry = newEntry();
      await saveHistory(entry);
      historyEntries = [entry, ...historyEntries];
      currentEntry = entry;
      closeSavePanel();
      statusMsg = 'Comparison saved to history.';
      errorMsg = '';
    } catch (error) { errorMsg = `Could not save comparison: ${(error as Error).message}`; }
    finally { saving = false; }
  }

  async function downloadHistory() {
    exporting = true;
    try { await exportHistory(); }
    catch (error) { errorMsg = `Export failed: ${(error as Error).message}`; }
    finally { exporting = false; }
  }

  async function uploadHistory(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || importing) return;
    importing = true;
    importSummary = null;
    errorMsg = '';
    try {
      importSummary = await importHistory(file);
      historyEntries = await listHistory();
      if (currentEntry) currentEntry = historyEntries.find((entry) => entry.id === currentEntry?.id) ?? null;
    } catch (error) { errorMsg = `Import failed: ${(error as Error).message}`; }
    finally { importing = false; }
  }

  async function savePart() {
    if (!selectedRegion || !partName.trim() || saving || (!currentEntry && !projectName.trim())) return;
    saving = true;
    try {
      const base = currentEntry ? $state.snapshot(currentEntry) : newEntry();
      const part: SavedPart = { id: crypto.randomUUID(), name: partName.trim(), note: partNote, region: { ...selectedRegion }, thumbnail: thumbnail(refImg!, selectedRegion) };
      const entry = { ...base, parts: [...base.parts, part] };
      await saveHistory(entry);
      historyEntries = [entry, ...historyEntries.filter((item) => item.id !== entry.id)];
      currentEntry = entry;
      selectedPartId = part.id;
      closeSavePanel();
      statusMsg = 'Part saved to history.';
      errorMsg = '';
    } catch (error) { errorMsg = `Could not save part: ${(error as Error).message}`; }
    finally { saving = false; }
  }

  async function removeHistoryEntry(id: string) {
    await deleteHistory(id);
    historyEntries = historyEntries.filter((entry) => entry.id !== id);
    if (currentEntry?.id === id) {
      currentEntry = null;
    }
  }

  async function openHistoryEntry(entry: HistoryEntry) {
    const referenceFile = entry.reference.file;
    const sourceFile = entry.source.file;
    const reference = await readImage(referenceFile);
    let source: { url: string; image: HTMLImageElement } | null = null;
    try {
      source = await readImage(sourceFile);
      for (let i = 0; i < entry.source.rotations; i++) {
        const next = await rotateImage(source.image);
        URL.revokeObjectURL(source.url);
        source = next;
      }
      if (reference.image.naturalWidth !== entry.reference.width || reference.image.naturalHeight !== entry.reference.height ||
        source.image.naturalWidth !== entry.source.width || source.image.naturalHeight !== entry.source.height) {
        throw new Error('Saved image dimensions differ from the comparison metadata.');
      }
      const result = await restoreAlignment(imageDataFromImg(reference.image), imageDataFromImg(source.image), entry.alignment);
      clearAll();
      refFile = referenceFile;
      srcFile = sourceFile;
      refUrl = reference.url;
      srcUrl = source.url;
      refImg = reference.image;
      srcImg = source.image;
      sourceRotations = entry.source.rotations;
      comparisonMode = entry.alignment.method;
      if (entry.alignment.method === 'manual') { manualResult = result; manualEditing = false; }
      else autoResult = result;
      currentEntry = entry;
      viewMode = defaultViewMode();
      historyOpen = false;
      statusMsg = 'Saved alignment restored without realigning.';
    } catch (error) {
      URL.revokeObjectURL(reference.url);
      if (source) URL.revokeObjectURL(source.url);
      throw error;
    }
  }

  async function startProjectEntry(entry: HistoryEntry) {
    const reference = await readImage(entry.reference.file);
    clearAll();
    refFile = entry.reference.file;
    refUrl = reference.url;
    refImg = reference.image;
    draftProjectName = entry.projectName;
    historyOpen = false;
    statusMsg = 'Reference loaded. Choose a new source image.';
    await tick();
    document.querySelector<HTMLInputElement>('[aria-label="Source upload"] input')?.focus();
  }

  function imageDataFromImg(img: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
</script>

<svelte:window onpointerdown={windowPointerDown} />

<header class="app-bar">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true"><Icon name="logo" size={20} /></span>
    <h1>Compare Sketch</h1>
  </div>
  <nav class="primary-nav segmented" aria-label="Main">
    <button aria-current={view === 'compare' ? 'page' : undefined} onclick={goCompare} title="Compare your sketch with the reference">
      <Icon name="compare" /><span class="nav-label">Compare</span>
    </button>
    <button id="nav-measure" aria-current={view === 'measure' ? 'page' : undefined} aria-disabled={!refImg} onclick={() => void goMeasure()}
      title={refImg ? (showingParts ? 'Measure distances in this part of the reference' : 'Measure distances on the reference') : 'Add a reference image to measure it'}>
      <Icon name="measure" /><span class="nav-label">Measure</span>
    </button>
    <button aria-current={view === 'history' ? 'page' : undefined} onclick={goHistory} title="Saved projects, comparisons, and parts">
      <Icon name="history" /><span class="nav-label">History</span>
    </button>
  </nav>
  <div class="app-status">
    <StorageStatus entries={historyEntries} />
    <button class="btn icon quiet magnifier-toggle" role="switch" aria-label="Magnifier" aria-checked={magnifierPreference.enabled}
      title={`Magnifier ${magnifierPreference.enabled ? 'on' : 'off'} — toggle for all marking tools`}
      onclick={() => magnifierPreference.enabled = !magnifierPreference.enabled}>
      <Icon name="magnifier" /><span class="switch-track" aria-hidden="true"></span>
    </button>
    <ThemeSelect />
    <button class="runtime-pill" class:ready={cvState === 'ready'} class:error={cvState === 'error'} onclick={() => { if (cvState === 'error') void loadCv(); }}
      aria-label={cvState === 'error' ? 'OpenCV failed. Retry' : runtimeLabel}
      title={cvState === 'error' ? 'Image aligner failed to load. Click to retry' : cvState === 'ready' ? 'Image aligner ready' : 'Loading the image aligner…'}>
      <span class="runtime-dot"></span>
      {#if cvState === 'error'}<span class="runtime-text">Retry</span>{:else if cvState !== 'ready'}<span class="runtime-text">Loading</span>{/if}
    </button>
    {@render account?.()}
  </div>
</header>

<main class="page">
  {#if historyOpen}
    <section class="page-head">
      <div>
        <h2>History</h2>
        <p>Projects, comparisons, and saved parts with notes — stored only in this browser.</p>
      </div>
      <div class="toolbar">
        <input type="file" accept=".json,application/json" aria-label="Import backup file" bind:this={importInput} onchange={uploadHistory} hidden />
        <button class="btn" aria-label="Import data" title={importing ? 'Importing…' : 'Import a JSON backup — existing data is kept'} onclick={() => importInput.click()} disabled={importing || exporting}><Icon name="import" /><span>Import</span></button>
        <span title={exporting ? 'Exporting…' : 'Export all data — images, parts, alignment, and notes'}><button class="btn" aria-label="Export all data" onclick={downloadHistory} disabled={exporting || importing || !historyEntries.length}><Icon name="export" /><span>Export all</span></button></span>
      </div>
    </section>
    <div role="status" aria-live="polite">
      {#if importing}<p class="notice">Importing backup…</p>
      {:else if importSummary}
        <p class="notice"><strong>Import complete.</strong> Imported: {importSummary.imported.projects} projects, {importSummary.imported.entries} entries, {importSummary.imported.parts} parts.<br />
          Already existed (kept): {importSummary.skipped.projects} projects, {importSummary.skipped.entries} entries, {importSummary.skipped.parts} parts.</p>
      {/if}
    </div>
    {#if errorMsg}<p class="notice error" role="alert">{errorMsg}</p>{/if}
    <HistoryView entries={historyEntries} onopen={openHistoryEntry} oncreate={startProjectEntry} ondelete={removeHistoryEntry} onstart={() => historyOpen = false} />
  {:else if measuring && refImg && refFile}
    <MeasureView image={refImg} file={refFile} region={measurementRegion} onback={() => { void closeMeasurement().catch((error) => errorMsg = error.message); }} />
  {:else if !refImg || !srcImg}
    <section class="upload">
      <div class="hero">
        <p class="eyebrow">A studio companion for drawing</p>
        <h2>Check your drawing against its reference.</h2>
        <p>Line up your sketch with the reference, study details side by side, keep notes, and measure proportions to carry back to the paper.</p>
      </div>
      <div class="upload-grid">
        <ImageDrop step={1} tone="reference" label="Reference" description="The image or drawing you are working from" previewUrl={refUrl} file={refFile} onselect={(file) => loadSelectedImage(file, 'ref')} />
        <ImageDrop step={2} tone="source" label="Source" description="Your drawing, to compare against the reference" previewUrl={srcUrl} file={srcFile} onselect={(file) => loadSelectedImage(file, 'src')} />
      </div>
      <div class="upload-footer">
        <span class="progress" aria-label="{selectedCount} of 2 images selected">
          <span class="progress-dots" aria-hidden="true"><span class:done={!!refImg}></span><span class:done={!!srcImg}></span></span>
          {selectedCount} of 2 selected
        </span>
        {#if refImg}
          <button class="btn accent-outline" aria-label="Measure reference" title="Measure the reference now — no source needed" onclick={() => openMeasurement()}><Icon name="measure" />Measure reference</button>
        {/if}
        <button class="btn quiet" onclick={clearAll} disabled={!refFile && !srcFile}>Reset</button>
      </div>
      <ul class="features" aria-label="What you can do">
        <li><span class="feature-icon"><Icon name="overlay" /></span><div><strong>Compare</strong><p>Side by side, stacked, or overlaid. Align automatically or with your own anchor points.</p></div></li>
        <li><span class="feature-icon"><Icon name="measure" /></span><div><strong>Measure</strong><p>Calibrate once on a grid, then measure horizontal and vertical distances between features.</p></div></li>
        <li><span class="feature-icon"><Icon name="note" /></span><div><strong>Keep notes</strong><p>Save parts of the drawing with notes, organised by project, to revisit later.</p></div></li>
      </ul>
      <p class="privacy-note"><Icon name="info" size={16} />Your images never leave this browser.</p>
    </section>
  {:else if showingParts && selectedRegion && activeResult}
    <PartsView reference={refImg} aligned={activeResult.aligned} region={selectedRegion} onback={closeParts}
      parts={savedParts} selectedPart={selectedPart} onprevious={() => adjacentPart(-1)} onnext={() => adjacentPart(1)}
      onmeasure={() => openMeasurement(selectedRegion)}
      onsave={() => showSavePanel(true)} onnewregion={() => { selectedRegion = null; void closeParts(); }} />
  {:else}
    <section class="workspace" class:has-dock={savedParts.length > 0 && !editingAnchors}>
      <div class="workspace-head">
        <div class="title-row">
          <h2>{currentEntry?.projectName ?? 'Untitled comparison'}</h2>
          {#if processingMode}<span class="chip accent"><span class="dot"></span>Aligning…</span>
          {:else if editingAnchors}<span class="chip accent"><span class="dot"></span>Placing anchors</span>
          {:else if comparisonMode === 'visual'}<span class="chip">Originals</span>
          {:else if activeResult}<span class="chip ok"><Icon name="check" size={13} />{comparisonMode === 'auto' ? 'Auto aligned' : 'Manually aligned'}</span>
          {:else}<span class="chip">Not aligned</span>{/if}
          {#if savedHere}<span class="chip ok"><Icon name="save" size={13} />Saved</span>{/if}
        </div>
        {#if savedHere && currentEntry?.note}<div class="subline"><NotePreview note={currentEntry.note} /></div>
        {:else}<p class="subline">{refFile?.name} <span aria-hidden="true">↔</span><span class="visually-hidden">compared with</span> {srcFile?.name}</p>{/if}
      </div>

      {#if !editingAnchors}
      <div class="workspace-toolbar toolbar" class:overlay-mode={viewMode === 'overlay'} role="toolbar" aria-label="Comparison tools">
        <div class="segmented alignment" role="group" aria-label="Alignment" title={cvState === 'ready' ? '' : 'Automatic alignment is available once the image aligner has loaded'}>
          <button aria-pressed={comparisonMode === 'visual'} onclick={() => chooseAlignment('visual')} disabled={processingMode !== null} title="Show the original images, without alignment">
            <Icon name="image" /><span class="label">Originals</span>
          </button>
          <button aria-pressed={comparisonMode === 'auto'} onclick={() => chooseAlignment('auto')} disabled={processingMode !== null || (cvState !== 'ready' && !autoResult)}
            title={autoResult ? 'Show the automatic alignment' : 'Align the source to the reference automatically'}>
            <Icon name="auto" /><span class="label">{processingMode === 'auto' ? 'Aligning…' : 'Auto align'}</span>
          </button>
          <button aria-pressed={comparisonMode === 'manual'} onclick={() => chooseAlignment('manual')} disabled={processingMode !== null}
            title={manualResult ? 'Show the manual alignment' : 'Align by clicking matching points on both images'}>
            <Icon name="manual" /><span class="label">{processingMode === 'manual' ? 'Aligning…' : 'Manual align'}</span>
          </button>
        </div>
        {#if comparisonMode === 'manual' && manualResult && !manualEditing}
          <button class="btn quiet" onclick={() => manualEditing = true} title="Adjust the anchor points and re-apply"><Icon name="edit" /><span class="label">Edit anchors</span></button>
        {/if}

          <span class="tool-sep" aria-hidden="true"></span>
          <div class="segmented icons" role="group" aria-label="Layout">
            <button aria-pressed={viewMode === 'side-by-side'} aria-label="Side by side" title="Side by side" onclick={() => selectViewMode('side-by-side')}><Icon name="side-by-side" /></button>
            <button aria-pressed={viewMode === 'stacked'} aria-label="Stack vertically" title="Stacked" onclick={() => selectViewMode('stacked')}><Icon name="stacked" /></button>
            <button aria-pressed={viewMode === 'overlay'} aria-label="Overlay" title="Overlay — source on top of reference" onclick={() => selectViewMode('overlay')}><Icon name="overlay" /></button>
          </div>
          {#if viewMode === 'overlay'}
            <div class="opacity-tools">
              <button class="btn icon" aria-pressed={overlayPlaying}
                aria-label={overlayPlaying ? 'Stop opacity animation' : 'Play opacity animation'}
                title={overlayPlaying ? 'Stop opacity animation' : 'Play — fade between reference and source'}
                onclick={overlayPlaying ? stopOverlayAnimation : startOverlayAnimation}>
                <Icon name={overlayPlaying ? 'stop' : 'play'} />
              </button>
              <label class="opacity-control">
                <span class="opacity-end">Ref</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={overlayOpacity} oninput={stopOverlayAnimation} aria-label="Overlay opacity" />
                <span class="opacity-end">Source</span>
                <output>{Math.round(overlayOpacity * 100)}%</output>
              </label>
            </div>
          {/if}
          <span title="Rotate source 90° clockwise"><button class="btn icon" onclick={rotateSource} disabled={sourceRotating} aria-label="Rotate source image 90 degrees clockwise"><Icon name="rotate" /></button></span>
          <span class="tool-sep" aria-hidden="true"></span>
          <span title={canSelectParts ? 'Select a new part — drag on the reference' : 'Align the images to select parts'}>
            <button class="btn" onclick={() => { selectedRegion = null; selectViewMode(defaultViewMode()); void tick().then(() => document.querySelector<HTMLElement>('[aria-label^="Select reference rectangle"]')?.focus()); }} disabled={!canSelectParts}>
              <Icon name="select" /><span class="label">Select part</span>
            </button>
          </span>
          <span title={selectedRegion ? 'Study the selected part in detail' : 'Select a part on the reference first'}>
            <button class="btn" class:accent-outline={!!selectedRegion} data-focus="compare-parts" onclick={compareParts} disabled={!selectedRegion || !activeResult}>
              <Icon name="parts" /><span class="label">Compare parts</span>
            </button>
          </span>
          <span class="tool-spacer"></span>
          <span title={savedHere ? 'Comparison already saved' : activeResult && comparisonMode !== 'visual' ? 'Save this comparison to a project' : 'Align the images to save a comparison'}>
            <button class="btn primary" aria-label="Save comparison" onclick={() => showSavePanel()} disabled={!activeResult || comparisonMode === 'visual' || savedHere || saving}>
              <Icon name={savedHere ? 'check' : 'save'} /><span class="label" aria-hidden="true">{savedHere ? 'Saved' : 'Save'}</span>
            </button>
          </span>
          <div class="menu-anchor">
            <button class="btn icon" bind:this={moreButton} aria-label="More actions" title="More actions" aria-haspopup="menu" aria-expanded={moreOpen} onclick={() => void toggleMore()}><Icon name="more" /></button>
            {#if moreOpen}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div class="menu popover" class:opens-right={menuOpensRight} role="menu" aria-label="More actions" tabindex="-1" bind:this={moreMenu} onkeydown={menuKeydown}>
                <button role="menuitem" onclick={() => { closeMore(false); replaceRefInput?.click(); }}><Icon name="replace-reference" />Replace reference…</button>
                <button role="menuitem" onclick={() => { closeMore(false); replaceSrcInput?.click(); }}><Icon name="replace-source" />Replace source…</button>
                <span class="menu-sep" role="separator"></span>
                <button role="menuitem" onclick={() => { closeMore(false); clearAll(); }}><Icon name="new" />New comparison</button>
              </div>
            {/if}
          </div>
          <input class="visually-hidden" tabindex="-1" bind:this={replaceRefInput} aria-label="Replace reference" type="file" accept="image/*" onchange={(event) => handleCompactFile(event, 'ref')} />
          <input class="visually-hidden" tabindex="-1" bind:this={replaceSrcInput} aria-label="Replace source" type="file" accept="image/*" onchange={(event) => handleCompactFile(event, 'src')} />
      </div>
      {/if}

      {#if errorMsg || statusMsg.toLowerCase().includes('could not')}
        <div class="status-bar" class:error={!!errorMsg} role={errorMsg ? 'alert' : 'status'}>
          <Icon name="info" size={16} />
          <span>{errorMsg || statusMsg}</span>
          {#if cvState === 'error'}<button class="btn quiet" onclick={loadCv}>Retry</button>{/if}
        </div>
      {:else if !editingAnchors}
        <p class="hint next-step" aria-live="polite"><Icon name="lightbulb" size={16} /><span>{nextHint}</span></p>
      {/if}

      <div id="comparison-workspace" class="workspace-body">
        {#if editingAnchors}
          <AnchorEditor
            {refImg}
            {srcImg}
            anchors={manualAnchors}
            selectedAnchorId={selectedManualAnchorId}
            listExpanded={anchorListExpanded}
            onadd={addManualAnchor}
            onmove={moveManualAnchor}
            onremove={removeManualAnchor}
            onclear={clearManualAnchors}
            onundo={undoManualAnchor}
            onselect={(id) => selectedManualAnchorId = id}
            ontogglelist={() => anchorListExpanded = !anchorListExpanded}
            onapply={() => processImages('manual')}
            oncancel={cancelAnchors}
            applying={processingMode === 'manual'}
            canApply={completeManualAnchors.length >= 4 && cvState === 'ready' && processingMode === null}
          />
        {:else}
          <CompareView
            {refImg}
            {srcImg}
            alignResult={comparisonMode === 'visual' ? null : activeResult}
            {viewMode}
            {overlayOpacity}
            referenceName={refFile?.name ?? 'Reference'}
            sourceName={srcFile?.name ?? 'Source'}
            {sourceRotations}
            bind:region={selectedRegion}
            savedRegions={savedParts.map((part) => part.region)}
            oncompareparts={compareParts}
          />
        {/if}
      </div>

      {#if savedParts.length && !editingAnchors}
        <nav class="saved-parts-bar" aria-label="Saved part navigation">
          <span title="Whole image — no previous part"><button class="btn icon quiet" aria-label="Previous part" disabled><Icon name="previous" /></button></span>
          <span class="navigator-title"><strong>Whole image</strong><small>{savedParts.length} saved {savedParts.length === 1 ? 'part' : 'parts'}</small></span>
          <button class="btn icon quiet" aria-label="Next part" title="Open the first saved part" onclick={() => openSavedPart(savedParts[0])}><Icon name="next" /></button>
        </nav>
      {/if}
    </section>
  {/if}
</main>

{#if savePanel}
  <div class="modal-scrim" role="presentation">
    <div class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-heading" tabindex="-1" bind:this={saveDialog} onkeydown={dialogKeydown}>
      <form class="save-panel" onsubmit={(event) => { event.preventDefault(); if (savingPart) void savePart(); else void saveComparison(); }}>
        <button type="button" class="btn icon quiet dialog-close" aria-label="Close save dialog" onclick={closeSavePanel}><Icon name="close" /></button>
        <h2 id="save-heading">{savingPart ? 'Save this part' : 'Save comparison'}</h2>
        <p>{savingPart ? 'Keep this detail and your notes with the saved alignment.' : 'Save this alignment and both images in this browser.'}</p>
        {#if savingPart && currentEntry}<p class="context"><Icon name="folder" size={16} />Adding to <strong>{currentEntry.projectName}</strong></p>{/if}
        {#if !savingPart || !currentEntry}
          <label>Project name <input bind:value={projectName} list="matching-projects" required placeholder="e.g. Portrait study" /></label>
          <datalist id="matching-projects">{#each matchingProjects as name}<option value={name}></option>{/each}</datalist>
          <label>Entry note <span class="optional">optional</span><textarea bind:value={entryNote} placeholder="What changed in this version?"></textarea></label>
        {/if}
        {#if savingPart}
          <label>Part name <input bind:value={partName} required placeholder="e.g. Left eye" /></label>
          <label>Part note <span class="optional">optional</span><textarea bind:value={partNote} placeholder="What to fix or remember"></textarea></label>
        {/if}
        {#if errorMsg}<p class="save-error" role="alert">{errorMsg}</p>{/if}
        <div class="save-actions"><button type="button" class="btn" onclick={closeSavePanel}>Cancel</button><button class="btn primary" disabled={saving}>{saving ? 'Saving…' : savingPart ? 'Save part' : 'Save comparison'}</button></div>
      </form>
    </div>
  </div>
{/if}

<style>
  /* App bar */
  .app-bar {
    align-items: center;
    backdrop-filter: saturate(1.4) blur(10px);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border-bottom: 1px solid var(--hairline);
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr auto 1fr;
    min-height: var(--app-bar-height);
    padding: 10px max(24px, env(safe-area-inset-right)) 10px max(24px, env(safe-area-inset-left));
    position: sticky;
    top: 0;
    z-index: 30;
  }
  .brand { align-items: center; display: flex; gap: 10px; min-width: 0; }
  .brand-mark { align-items: center; background: var(--accent); border-radius: 9px; color: var(--on-accent); display: flex; flex: none; height: 32px; justify-content: center; width: 32px; }
  h1 { font-size: 1.05rem; font-weight: 600; letter-spacing: -0.015em; white-space: nowrap; }
  .primary-nav > button { min-height: 36px; padding: 0 0.9rem; }
  .primary-nav > button[aria-disabled='true'] { opacity: 0.5; }
  .app-status { align-items: center; display: flex; gap: 4px; justify-content: flex-end; }
  .magnifier-toggle { color: var(--ink-muted); position: relative; }
  .magnifier-toggle[aria-checked='true'] { background: var(--accent-tint); color: var(--accent); }
  .switch-track { background: var(--ink-muted); border-radius: 999px; bottom: 3px; height: 7px; position: absolute; right: 3px; width: 14px; }
  .switch-track::after { background: var(--surface); border-radius: 50%; content: ''; height: 5px; left: 1px; position: absolute; top: 1px; width: 5px; }
  .magnifier-toggle[aria-checked='true'] .switch-track { background: var(--accent); }
  .magnifier-toggle[aria-checked='true'] .switch-track::after { left: 8px; }
  .runtime-pill { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 10px; color: var(--ink-muted); cursor: default; display: inline-flex; font-size: 0.78rem; gap: 6px; justify-content: center; min-height: 40px; min-width: 40px; padding: 0 8px; }
  .runtime-pill.error { background: var(--danger-tint); color: var(--danger); cursor: pointer; }
  .runtime-dot { background: var(--warning); border-radius: 50%; height: 8px; width: 8px; }
  .runtime-pill:not(.ready, .error) .runtime-dot { animation: pulse 1.4s ease-in-out infinite; }
  .runtime-pill.ready .runtime-dot { background: var(--ok); }
  .runtime-pill.error .runtime-dot { background: var(--danger); }
  @keyframes pulse { 50% { opacity: 0.3; } }

  /* Page frame */
  .page { margin: 0 auto; max-width: 1640px; padding: 20px 24px 48px; }
  .page-head { align-items: flex-end; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; margin: 8px 0 16px; }
  .page-head h2 { font-size: 1.75rem; line-height: 1.2; }
  .page-head p { color: var(--ink-muted); margin-top: 4px; }
  .notice { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); color: var(--ink-muted); font-size: 0.85rem; margin-bottom: 12px; padding: 10px 14px; }
  .notice.error { border-color: var(--danger); color: var(--danger); }

  /* Upload */
  .upload { margin: 3vh auto 0; max-width: 1180px; }
  .hero { margin: 0 auto 32px; max-width: 720px; text-align: center; }
  .eyebrow { color: var(--accent); font-size: 0.78rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .hero h2 { font-size: clamp(1.9rem, 3.6vw, 2.8rem); letter-spacing: -0.025em; line-height: 1.12; margin: 10px 0 12px; }
  .hero p:last-child { color: var(--ink-muted); font-size: 1.02rem; line-height: 1.55; }
  .upload-grid { display: grid; gap: 20px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .upload-footer { align-items: center; color: var(--ink-muted); display: flex; flex-wrap: wrap; font-size: 0.875rem; gap: 12px; justify-content: center; margin-top: 20px; }
  .progress { align-items: center; display: inline-flex; gap: 8px; margin-right: 8px; }
  .progress-dots { display: inline-flex; gap: 4px; }
  .progress-dots span { background: var(--hairline); border-radius: 999px; height: 6px; transition: background 160ms var(--ease); width: 18px; }
  .progress-dots span.done { background: var(--accent); }
  .features { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; margin-top: 40px; }
  .features li { align-items: flex-start; border-top: 1px solid var(--hairline); display: flex; gap: 12px; padding-top: 16px; }
  .feature-icon { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; color: var(--accent); display: flex; flex: none; height: 36px; justify-content: center; width: 36px; }
  .features strong { display: block; font-weight: 600; margin-bottom: 2px; }
  .features p { color: var(--ink-muted); font-size: 0.85rem; line-height: 1.5; }
  .privacy-note { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.82rem; gap: 6px; justify-content: center; margin-top: 32px; }

  /* Workspace */
  .workspace { display: flex; flex-direction: column; gap: 12px; }
  .workspace.has-dock { --dock-space: 72px; padding-bottom: 88px; }
  .workspace-head { min-width: 0; }
  .title-row { align-items: center; display: flex; flex-wrap: wrap; gap: 8px 10px; }
  .title-row h2 { font-size: 1.4rem; line-height: 1.25; min-width: 0; overflow-wrap: anywhere; }
  .subline { color: var(--ink-muted); font-size: 0.85rem; margin-top: 2px; max-width: 80ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-toolbar { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 8px; position: sticky; top: calc(var(--app-bar-height) + 8px); z-index: 20; }
  .opacity-tools { align-items: center; display: flex; gap: 8px; }
  .opacity-control { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.75rem; gap: 6px; }
  .opacity-control input { width: 140px; }
  .opacity-control output { color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; width: 2.6rem; }
  .menu-anchor { position: relative; }
  .menu { display: grid; min-width: 230px; padding: 6px; position: absolute; right: 0; top: calc(100% + 8px); z-index: 40; }
  .menu button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--ink); cursor: pointer; display: flex; font-size: 0.875rem; gap: 10px; min-height: 40px; padding: 0 10px; text-align: left; }
  .menu button:is(:hover, :focus-visible) { background: var(--accent-tint); outline: none; }
  .menu.opens-right { left: 0; right: auto; }
  .menu-sep { background: var(--hairline); height: 1px; margin: 4px 6px; }
  .next-step { padding: 0 4px; }
  .status-bar { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); color: var(--ink-muted); display: flex; font-size: 0.85rem; gap: 8px; padding: 6px 8px 6px 12px; }
  .status-bar.error { background: var(--danger-tint); border-color: transparent; color: var(--danger); }
  .status-bar .btn { color: inherit; margin-left: auto; min-height: 32px; }
  .saved-parts-bar { align-items: center; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); bottom: calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow-lg); display: grid; gap: 4px; grid-template-columns: 40px minmax(0, 1fr) 40px; left: 50%; max-width: calc(100vw - 32px); padding: 6px; position: fixed; transform: translateX(-50%); width: 340px; z-index: 20; }
  .navigator-title { display: grid; line-height: 1.25; min-width: 0; text-align: center; }
  .navigator-title strong { font-size: 0.85rem; font-weight: 600; }
  .navigator-title small { color: var(--ink-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }

  /* Save dialog */
  .modal-scrim { align-items: center; animation: fade 180ms var(--ease); background: var(--scrim); display: flex; inset: 0; justify-content: center; padding: 1rem; position: fixed; z-index: 50; }
  .save-dialog { animation: rise 200ms var(--ease); background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); max-height: calc(100dvh - 2rem); overflow: auto; width: min(100%, 480px); }
  .save-panel { display: grid; gap: 14px; padding: 28px; position: relative; }
  .save-panel h2 { font-size: 1.35rem; padding-right: 40px; }
  .save-panel > p { color: var(--ink-muted); font-size: 0.875rem; margin-top: -8px; }
  .save-panel .context { align-items: center; background: var(--surface-2); border-radius: var(--radius-sm); color: var(--ink-muted); display: flex; gap: 8px; margin-top: 0; padding: 8px 12px; }
  .save-panel label { display: grid; font-size: 0.85rem; font-weight: 500; gap: 6px; }
  .optional { color: var(--ink-muted); font-size: 0.75rem; font-weight: 400; margin-left: 4px; }
  .save-panel label:has(.optional) { grid-template-columns: auto 1fr; }
  .save-panel label:has(.optional) textarea { grid-column: 1 / -1; }
  .save-panel input, .save-panel textarea { background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; color: var(--ink); min-height: 42px; padding: 0.6rem 0.75rem; width: 100%; }
  .save-panel :is(input, textarea):focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); outline: none; }
  .save-panel textarea { min-height: 88px; resize: vertical; }
  .save-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .save-error { color: var(--danger); font-size: 0.85rem; }
  .dialog-close { position: absolute; right: 14px; top: 14px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(6px) scale(0.985); } }

  @media (max-width: 1500px) {
    .overlay-mode :global(.btn .label) { border: 0; clip: rect(0 0 0 0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px; }
    .overlay-mode :global(.btn:has(.label)) { padding: 0; width: 40px; }
  }
  @media (max-width: 1180px) {
    .workspace-toolbar :global(.btn .label) { border: 0; clip: rect(0 0 0 0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px; }
    .workspace-toolbar :global(.btn:has(.label)) { padding: 0; width: 40px; }
  }
  @media (max-width: 899px) {
    .app-bar { grid-template-columns: auto 1fr auto; }
    .primary-nav { justify-self: center; }
    .nav-label { display: none; }
    .features { grid-template-columns: 1fr; gap: 0; }
    .features li { padding: 14px 0; }
  }
  @media (max-width: 719px) {
    .app-bar { gap: 8px; padding: 8px 12px; }
    .primary-nav > button { padding: 0; width: 36px; }
    .runtime-pill { min-width: 28px; padding: 0; }
    h1 { display: none; }
    .page { padding: 14px 12px 40px; }
    .upload-grid { grid-template-columns: 1fr; gap: 14px; }
    .hero { margin-bottom: 20px; }
    .hero p:last-child { font-size: 0.92rem; }
    .alignment :global(.label) { border: 0; clip: rect(0 0 0 0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px; }
    .alignment > button { padding: 0; width: 40px; }
    .workspace-toolbar { gap: 6px; padding: 6px; top: calc(var(--app-bar-height) + 4px); }
    .workspace-toolbar .tool-sep { display: none; }
    .opacity-tools { order: 10; width: 100%; }
    .opacity-control { flex: 1; }
    .opacity-control input { flex: 1; width: auto; }
    .modal-scrim { align-items: flex-end; padding: 0; }
    .save-dialog { border-radius: var(--radius-lg) var(--radius-lg) 0 0; max-height: calc(100dvh - env(safe-area-inset-top) - 1rem); padding-bottom: env(safe-area-inset-bottom); width: 100%; }
    .save-panel { padding: 22px 18px; }
  }
  @media (max-width: 479px) {
    .brand { display: none; }
    .app-bar { grid-template-columns: 1fr auto; }
  }
  @media (max-width: 359px) {
    .app-bar { gap: 4px; grid-template-columns: 1fr auto; padding: 8px max(4px, env(safe-area-inset-right)) 8px max(4px, env(safe-area-inset-left)); }
    .primary-nav > button { min-width: 32px; width: 32px; }
    .app-status { gap: 2px; }
    .app-status :global(.storage .meter) { display: none; }
    .runtime-text { display: none; }
  }
</style>
