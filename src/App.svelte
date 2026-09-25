<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import {
    alignImages,
    alignImagesManually,
    loadOpenCV,
    onStatus,
    restoreAlignment
  } from './lib/opencv';
  import type { AlignResult, CvState } from './lib/opencv';
  import { deleteHistory, listHistory, saveHistory } from './lib/history';
  import type { HistoryEntry, SavedPart } from './lib/history';
  import { completeAnchors } from './lib/manualAnchors';
  import type { ManualAnchor, Point } from './lib/manualAnchors';
  import AnchorEditor from './components/AnchorEditor.svelte';
  import CompareView from './components/CompareView.svelte';
  import HistoryView from './components/HistoryView.svelte';
  import NotePreview from './components/NotePreview.svelte';
  import PartsView from './components/PartsView.svelte';
  import type { Region } from './lib/region';
  import ImageDrop from './components/ImageDrop.svelte';
  import type { ComparisonMode } from './components/ModeSwitch.svelte';

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
  let viewMode = $state('side-by-side');
  let selectedRegion: Region | null = $state(null);
  let showingParts = $state(false);
  let overlayOpacity = $state(0.5);
  let overlayPlaying = $state(false);
  let sourceRotating = $state(false);
  let sourceRotations = $state(0);
  let historyOpen = $state(false);
  let historyEntries: HistoryEntry[] = $state([]);
  let currentEntry: HistoryEntry | null = $state(null);
  let restoredMethod: 'manual' | 'auto' | null = $state(null);
  let selectedPartId = $state('');
  let savePanel = $state(false);
  let actionMenu = $state(false);
  let saveDialog: HTMLDivElement = $state()!;
  let returnFocus: HTMLElement | null = null;
  let projectName = $state('');
  let entryNote = $state('');
  let partName = $state('');
  let partNote = $state('');
  let saving = $state(false);
  let statusMsg = $state('');
  let errorMsg = $state('');
  let overlayAnimationFrame: number | null = null;

  const OVERLAY_ANIMATION_DURATION = 1600;

  let completeManualAnchors = $derived(completeAnchors(manualAnchors));
  let selectedCount = $derived((refImg ? 1 : 0) + (srcImg ? 1 : 0));
  let activeResult = $derived(comparisonMode === 'manual' ? manualResult : comparisonMode === 'auto' ? autoResult : null);
  let savedParts = $derived(currentEntry && currentEntry.alignment.method === comparisonMode ? currentEntry.parts : []);
  let selectedPartIndex = $derived(savedParts.findIndex((part) => part.id === selectedPartId));
  let selectedPart = $derived(savedParts[selectedPartIndex] ?? null);
  let matchingProjects = $derived([...new Set(historyEntries.filter((entry) => entry.reference.name === refFile?.name).map((entry) => entry.projectName))]);
  let runtimeLabel = $derived(
    cvState === 'ready' ? 'OpenCV ready' : cvState === 'loading' ? 'Preparing OpenCV' : cvState === 'error' ? 'OpenCV needs retry' : 'OpenCV pending'
  );

  let unsubscribeStatus: (() => void) | null = null;
  if (!unsubscribeStatus) {
    unsubscribeStatus = onStatus((message) => statusMsg = message);
  }

  onDestroy(() => {
    if (overlayAnimationFrame !== null) cancelAnimationFrame(overlayAnimationFrame);
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

  async function closeParts() {
    showingParts = false;
    await tick();
    document.querySelector<HTMLButtonElement>('[aria-label="Compare parts"]')?.focus();
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
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
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
    restoredMethod = null;
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
    if (refUrl) URL.revokeObjectURL(refUrl);
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    refFile = null;
    srcFile = null;
    refUrl = '';
    srcUrl = '';
    refImg = null;
    srcImg = null;
    sourceRotations = 0;
    comparisonMode = 'visual';
    viewMode = 'side-by-side';
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
    if (mode === 'visual') viewMode = 'side-by-side';
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
        if (restoredMethod === method) restoredMethod = null;
      }
      viewMode = 'side-by-side';
    } catch (error) {
      errorMsg = `${method === 'manual' ? 'Manual' : 'Automatic'} alignment failed: ${(error as Error).message}`;
    } finally {
      processingMode = null;
    }
  }

  function showSavePanel() {
    returnFocus = document.querySelector<HTMLElement>('.fab-area .fab, .part-actions .fab') ?? document.activeElement as HTMLElement;
    actionMenu = false;
    projectName = currentEntry?.projectName ?? refFile?.name.replace(/\.[^.]+$/, '') ?? '';
    entryNote = '';
    partName = '';
    partNote = '';
    savePanel = true;
    void tick().then(() => saveDialog?.querySelector<HTMLElement>('input, button')?.focus());
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
      id: crypto.randomUUID(), version: 1, projectName: projectName.trim(), createdAt: new Date().toISOString(), note: entryNote,
      reference: { name: refFile.name, width: refImg.naturalWidth, height: refImg.naturalHeight },
      source: { name: srcFile.name, width: srcImg.naturalWidth, height: srcImg.naturalHeight, rotations: sourceRotations },
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

  async function savePart() {
    if (!selectedRegion || !partName.trim() || saving || (!currentEntry && !projectName.trim())) return;
    saving = true;
    try {
      const base = currentEntry ? $state.snapshot(currentEntry) : newEntry();
      const part: SavedPart = { id: crypto.randomUUID(), name: partName.trim(), note: partNote, region: { ...selectedRegion } };
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
      restoredMethod = null;
    }
  }

  async function openHistoryEntry(entry: HistoryEntry, referenceFile: File, sourceFile: File) {
    if (referenceFile.name !== entry.reference.name || sourceFile.name !== entry.source.name) throw new Error('Select files with the names shown in this entry.');
    if (!referenceFile.type.startsWith('image/') || !sourceFile.type.startsWith('image/')) throw new Error('Select two image files.');
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
        throw new Error('Image dimensions differ from the saved comparison. Select the original files.');
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
      restoredMethod = entry.alignment.method;
      viewMode = 'side-by-side';
      historyOpen = false;
      statusMsg = 'Saved alignment restored without realigning.';
    } catch (error) {
      URL.revokeObjectURL(reference.url);
      if (source) URL.revokeObjectURL(source.url);
      throw error;
    }
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

<header class="app-header">
  {#if historyOpen}<button class="secondary-btn" onclick={() => historyOpen = false}>← Back to comparison</button>
  {:else if !refImg || !srcImg}<h1><span aria-hidden="true">✎</span> Compare Sketch</h1>
  {:else if comparisonMode === 'manual' && manualEditing}<button class="secondary-btn" onclick={() => selectMode('visual')}>← Cancel anchors</button>
  {:else}<span></span>{/if}
  <div class="header-actions">
    {#if !historyOpen && !(comparisonMode === 'manual' && manualEditing && refImg && srcImg)}<button class="secondary-btn" onclick={() => { historyOpen = true; actionMenu = false; }}>◷ &nbsp; History</button>{/if}
    <span class="runtime-pill" class:ready={cvState === 'ready'} class:error={cvState === 'error'}>
      <span class="runtime-dot"></span>{runtimeLabel}
    </span>
  </div>
</header>

<main>
  {#if historyOpen}
    <div class="history-intro"><h2>History</h2><p>Saved alignments on this browser. Images stay on your device.</p></div>
    <HistoryView entries={historyEntries} onopen={openHistoryEntry} ondelete={removeHistoryEntry} />
  {:else if !refImg || !srcImg}
    <section class="upload-section">
      <div class="intro">
        <h2>Choose two images</h2>
        <p>Add an original reference and the source you want to inspect.</p>
      </div>
      <div class="upload-grid">
        <ImageDrop label="Reference" description="Original sketch" previewUrl={refUrl} file={refFile} onselect={(file) => loadSelectedImage(file, 'ref')} />
        <ImageDrop label="Source" description="Sketch with changes" previewUrl={srcUrl} file={srcFile} onselect={(file) => loadSelectedImage(file, 'src')} />
      </div>
      <div class="upload-footer">
        <span>{selectedCount} of 2 selected</span><span aria-hidden="true">│</span>
        <button class="text-btn" onclick={clearAll} disabled={!refFile && !srcFile}>Reset</button>
      </div>
    </section>
  {:else if showingParts && selectedRegion && activeResult}
    <PartsView reference={refImg} aligned={activeResult.aligned} region={selectedRegion} onback={closeParts}
      parts={savedParts} selectedPart={selectedPart} onprevious={() => adjacentPart(-1)} onnext={() => adjacentPart(1)}
      onsave={showSavePanel} onadjust={closeParts} onnewregion={() => { selectedRegion = null; void closeParts(); }} />
  {:else}
    <section class="workspace-shell">
      <div class="workspace-nav">
        <div>
          <h2>{currentEntry?.projectName ?? (comparisonMode === 'manual' && manualEditing ? 'Place matching points' : 'Compare images')}</h2>
          {#if currentEntry && currentEntry.alignment.method === comparisonMode}<NotePreview note={currentEntry.note} />
          {:else}<p>{comparisonMode === 'manual' && manualEditing ? 'Click the same feature on each image to pair points · Drag to refine · Arrow keys nudge' : comparisonMode === 'visual' ? 'Original images · No alignment applied' : comparisonMode === 'auto' ? 'Automatic alignment' : 'Manual alignment'}</p>{/if}
        </div>
        <span class="method-label">{comparisonMode === 'visual' ? 'Originals' : comparisonMode === 'manual' ? 'Manual anchors' : 'Auto aligned'}</span>
      </div>

      {#if !(comparisonMode === 'manual' && manualEditing)}
      <div class="workspace-header">
        <div class="workspace-actions">
          {#if activeResult && !(comparisonMode === 'manual' && manualEditing)}
            <div class="view-toggle" aria-label="Result display">
              <button class:active={viewMode === 'side-by-side'} aria-pressed={viewMode === 'side-by-side'} aria-label="Side by side" title="Side by side" onclick={() => selectViewMode('side-by-side')}>◫</button>
              <button class:active={viewMode === 'stacked'} aria-pressed={viewMode === 'stacked'} aria-label="Stack vertically" title="Stack vertically" onclick={() => selectViewMode('stacked')}>☷</button>
              <button class:active={viewMode === 'overlay'} aria-pressed={viewMode === 'overlay'} aria-label="Overlay" title="Overlay" onclick={() => selectViewMode('overlay')}>▣</button>
            </div>
            {#if viewMode === 'overlay'}
              <div class="opacity-tools">
                <label class="opacity-control">
                  <span>Opacity</span>
                  <input type="range" min="0" max="1" step="0.01" bind:value={overlayOpacity} aria-label="Overlay opacity" />
                  <output>{Math.round(overlayOpacity * 100)}%</output>
                </label>
                <button
                  class="play-btn"
                  class:playing={overlayPlaying}
                  aria-pressed={overlayPlaying}
                  aria-label={overlayPlaying ? 'Stop opacity animation' : 'Play opacity animation'}
                  onclick={overlayPlaying ? stopOverlayAnimation : startOverlayAnimation}
                >
                  <span aria-hidden="true">{overlayPlaying ? '■' : '▶'}</span>
                  {overlayPlaying ? 'Stop' : 'Play'}
                </button>
              </div>
            {/if}
          {/if}

          {#if comparisonMode === 'visual'}
            <button class="secondary-btn" onclick={rotateSource} disabled={sourceRotating} aria-label="Rotate source image 90 degrees clockwise">↻ Rotate source</button>
          {/if}
        </div>
      </div>
      {/if}

      <div id="comparison-workspace" class="workspace-body" role="tabpanel">
        {#if comparisonMode === 'manual' && manualEditing}
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
            canApply={completeManualAnchors.length >= 4 && cvState === 'ready' && processingMode === null}
          />
        {:else}
          <CompareView
            {refImg}
            {srcImg}
            alignResult={comparisonMode === 'visual' ? null : activeResult}
            viewMode={comparisonMode === 'visual' || !activeResult ? 'side-by-side' : viewMode}
            {overlayOpacity}
            referenceName={refFile?.name ?? 'Reference'}
            sourceName={srcFile?.name ?? 'Source'}
            bind:region={selectedRegion}
            savedRegions={savedParts.map((part) => part.region)}
            oncompareparts={compareParts}
          />
        {/if}
      </div>

      {#if errorMsg || statusMsg.includes('could not')}
        <div class="status-bar" class:error={!!errorMsg}>
          <span class="status-dot"></span>
          <span>{errorMsg || statusMsg}</span>
          {#if cvState === 'error'}<button onclick={loadCv}>Retry</button>{/if}
        </div>
      {/if}
    </section>
    {#if !(comparisonMode === 'manual' && manualEditing)}
      <div class="fab-area">
        {#if actionMenu}
          <nav class="action-menu" aria-label="Comparison actions">
            {#if activeResult}<button onclick={() => { actionMenu = false; compareParts(); }} disabled={!selectedRegion}>Compare parts</button>{/if}
            {#if savedParts.length && activeResult}
              <span>Saved parts ({savedParts.length})</span>
              {#each savedParts as part}<button onclick={() => { actionMenu = false; openSavedPart(part); }}>{part.name}</button>{/each}
            {/if}
            {#if selectedRegion}<button onclick={() => { selectedRegion = null; actionMenu = false; }}>Clear region selection</button>{/if}
            {#if activeResult}<button onclick={showSavePanel} disabled={restoredMethod === comparisonMode}>Save comparison</button>{/if}
            <span>Alignment</span>
            {#if comparisonMode === 'auto'}<button onclick={() => { actionMenu = false; void processImages('auto'); }} disabled={cvState !== 'ready' || processingMode !== null}>{processingMode === 'auto' ? 'Aligning…' : 'Run auto align again'}</button>
            {:else}<button onclick={() => { selectMode('auto'); actionMenu = false; void processImages('auto'); }} disabled={cvState !== 'ready'}>Auto align</button>{/if}
            <button onclick={() => { selectMode('manual'); manualEditing = true; actionMenu = false; }} disabled={restoredMethod === 'manual' && comparisonMode === 'manual'}>Edit manual anchors</button>
            <button onclick={() => { selectMode('visual'); actionMenu = false; }}>View originals</button>
            <label class="menu-file">Replace reference<input type="file" accept="image/*" onchange={(event) => { handleCompactFile(event, 'ref'); actionMenu = false; }} /></label>
            <label class="menu-file">Replace source<input type="file" accept="image/*" onchange={(event) => { handleCompactFile(event, 'src'); actionMenu = false; }} /></label>
            <button onclick={() => { clearAll(); actionMenu = false; }}>New comparison</button>
          </nav>
        {/if}
        <button class="fab" aria-label={actionMenu ? 'Close actions' : 'Open actions'} aria-expanded={actionMenu} onclick={() => actionMenu = !actionMenu}>{actionMenu ? '×' : '+'}</button>
      </div>
    {/if}
  {/if}
</main>

{#if savePanel}
  <div class="modal-scrim" role="presentation">
    <div class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-heading" tabindex="-1" bind:this={saveDialog} onkeydown={dialogKeydown}>
      <form class="save-panel" onsubmit={(event) => { event.preventDefault(); if (showingParts) void savePart(); else void saveComparison(); }}>
        <button type="button" class="dialog-close" aria-label="Close save dialog" onclick={closeSavePanel}>×</button>
        <h2 id="save-heading">{showingParts ? 'Save this part' : 'Save comparison'}</h2>
        <p>{showingParts ? 'Keep this detail with your saved alignment.' : 'Save this alignment as a new entry. Images remain on your device.'}</p>
        {#if !showingParts || !currentEntry}
          <label>Project name <input bind:value={projectName} list="matching-projects" required /></label>
          <datalist id="matching-projects">{#each matchingProjects as name}<option value={name}></option>{/each}</datalist>
          <label>Entry note (optional) <textarea bind:value={entryNote}></textarea></label>
        {/if}
        {#if showingParts}
          <label>Part name <input bind:value={partName} required /></label>
          <label>Part note (optional) <textarea bind:value={partNote}></textarea></label>
        {/if}
        <div class="save-actions"><button type="button" class="secondary-btn" onclick={closeSavePanel}>Cancel</button><button class="primary-btn" disabled={saving}>{showingParts ? 'Save part' : 'Save entry'}</button></div>
        {#if errorMsg}<p class="save-error" role="alert">{errorMsg}</p>{/if}
      </form>
    </div>
  </div>
{/if}

<style>
  .app-header {
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    padding: 1rem 2rem;
  }
  .header-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 0.75rem; }

  h1, h2, p { margin: 0; }
  h1 { font-size: 1.45rem; font-weight: 850; letter-spacing: -0.025em; }
  h2 { font-size: 1.15rem; }

  .runtime-pill {
    align-items: center;
    background: #f6f7f9;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    display: inline-flex;
    font-size: 0.76rem;
    font-weight: 750;
    gap: 0.45rem;
    padding: 0.4rem 0.7rem;
  }

  .runtime-pill.ready { background: #e9f8ef; border-color: #bde8cb; color: #126b34; }
  .runtime-pill.error { background: #fff0f0; border-color: #fecaca; color: var(--danger); }
  .runtime-dot, .status-dot { background: currentColor; border-radius: 50%; height: 0.45rem; width: 0.45rem; }

  main {
    display: grid;
    gap: 0.85rem;
    margin: 0 auto;
    max-width: 1680px;
    padding: 1rem 1.25rem 1.5rem;
  }

  .upload-section, .workspace-shell {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .upload-section { margin: 5vh auto 0; max-width: 1080px; padding: 1.25rem; width: 100%; }
  .intro { margin-bottom: 1.25rem; }
  .intro h2 { font-size: 1.5rem; margin-top: 0.25rem; }
  .intro > p:last-child { color: var(--muted); font-size: 0.88rem; margin-top: 0.35rem; }
  .upload-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .upload-footer { align-items: center; color: var(--muted); display: flex; font-size: 0.78rem; justify-content: space-between; padding-top: 1rem; }

  .text-btn {
    background: transparent;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.5rem;
    position: relative;
  }
  .text-btn:disabled { cursor: not-allowed; opacity: 0.45; }

  .workspace-shell { overflow: visible; }
  .workspace-nav, .workspace-header {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.85rem 1rem;
  }
  .workspace-nav { border-bottom: 1px solid var(--border); }
  .workspace-nav > div:first-child p { color: var(--muted); font-size: 0.76rem; margin-top: 0.2rem; }
  .workspace-header { background: #fbfcfd; border-bottom: 1px solid var(--border); }
  .workspace-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; }

  .primary-btn, .secondary-btn {
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 850;
    min-height: 2.35rem;
    padding: 0.5rem 0.8rem;
  }
  .primary-btn { background: var(--accent); border: 1px solid var(--accent); color: #fff; }
  .primary-btn { align-items: center; display: inline-flex; gap: 0.45rem; justify-content: center; }
  .secondary-btn { background: #fff; border: 1px solid var(--border); color: var(--text); }
  .primary-btn:disabled { cursor: not-allowed; opacity: 0.5; }
  .secondary-btn:disabled { background: #f1f3f5; color: var(--muted); cursor: not-allowed; opacity: 0.65; }

  .view-toggle { background: var(--control-bg); border: 1px solid var(--border); border-radius: 7px; display: flex; padding: 0.18rem; }
  .view-toggle button { background: transparent; border: 0; border-radius: 5px; color: var(--muted); cursor: pointer; font-size: 0.72rem; font-weight: 800; padding: 0.42rem 0.55rem; }
  .view-toggle button.active { background: #fff; box-shadow: 0 1px 4px rgba(20, 26, 35, 0.12); color: var(--text); }
  .opacity-tools { align-items: center; display: flex; gap: 0.45rem; }
  .opacity-control { align-items: center; color: var(--muted); display: flex; font-size: 0.72rem; font-weight: 750; gap: 0.4rem; }
  .opacity-control input { accent-color: var(--accent); width: 90px; }
  .opacity-control output { color: var(--text); font-variant-numeric: tabular-nums; text-align: right; width: 2.4rem; }
  .play-btn {
    align-items: center;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--accent);
    cursor: pointer;
    display: inline-flex;
    font-size: 0.72rem;
    font-weight: 850;
    gap: 0.35rem;
    min-height: 2.1rem;
    padding: 0.4rem 0.6rem;
  }
  .play-btn:hover { background: var(--control-bg); border-color: var(--accent); }
  .play-btn.playing { background: #fff3f3; border-color: #fecaca; color: var(--danger); }
  .play-btn span { font-size: 0.62rem; line-height: 1; }
  .workspace-body { padding: 0.85rem; }
  .save-panel { background: #f8fbff; border: 1px solid var(--border); border-radius: 8px; display: grid; gap: 0.7rem; margin: 0.85rem; max-width: 600px; padding: 1rem; }
  .save-panel p { color: var(--muted); font-size: 0.8rem; }
  .save-panel label { display: grid; font-size: 0.8rem; font-weight: 750; gap: 0.3rem; }
  .save-panel input, .save-panel textarea { border: 1px solid var(--border); border-radius: 5px; font: inherit; padding: 0.55rem; width: 100%; }
  .save-panel textarea { min-height: 5rem; resize: vertical; }
  .save-actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
  .save-panel .save-error { color: var(--danger); }
  .status-bar { align-items: center; border-top: 1px solid var(--border); color: var(--muted); display: flex; font-size: 0.76rem; gap: 0.5rem; padding: 0.65rem 0.9rem; }
  .status-bar.error { background: #fff5f5; color: var(--danger); }
  .status-bar button { background: transparent; border: 0; color: currentColor; cursor: pointer; font-weight: 800; margin-left: auto; }

  @media (max-width: 820px) {
    .app-header { padding-inline: 1rem; }
    main { padding-inline: 0.75rem; }
    .upload-grid { grid-template-columns: 1fr; }
    .workspace-nav, .workspace-header { align-items: stretch; flex-direction: column; }
    .workspace-actions { justify-content: stretch; width: 100%; }
    .workspace-actions > button, .view-toggle { flex: 1; }
    .view-toggle button { flex: 1; }
    .opacity-tools { justify-content: space-between; width: 100%; }
    .opacity-control { flex: 1; }
    .opacity-control input { flex: 1; width: auto; }
  }

  @media (max-width: 540px) {
    .runtime-pill { font-size: 0; }
    .runtime-dot { height: 0.6rem; width: 0.6rem; }
    .workspace-body { padding: 0.5rem; }
  }

  .app-header { background: transparent; border: 0; padding: 1.25rem clamp(1rem, 3vw, 3rem); }
  .app-header h1 { font-size: 1.4rem; letter-spacing: -0.03em; }
  .app-header h1 span { font-family: sans-serif; margin-right: 0.4rem; }
  .header-actions { margin-left: auto; }
  .runtime-pill, .secondary-btn { background: #fff; border: 1px solid var(--border); border-radius: 999px; box-shadow: 0 2px 12px #352b1b0b; color: var(--text); font-weight: 500; padding: 0.65rem 1rem; }
  .runtime-pill.ready { background: #fff; border-color: var(--border); color: var(--muted); }
  .runtime-pill.ready .runtime-dot { background: #13ad50; }
  main { max-width: 1600px; padding: 0 clamp(1rem, 3vw, 3rem) 10rem; }
  .upload-section { background: transparent; border: 0; margin: 2rem auto 0; max-width: 1340px; padding: 0; }
  .intro { margin: 0 auto 2.5rem; text-align: center; }
  .intro h2 { font-size: clamp(2.5rem, 4vw, 3.7rem); line-height: 1.1; }
  .intro > p:last-child { font-size: 1.05rem; margin-top: 0.5rem; }
  .upload-grid { gap: 1.5rem; }
  .upload-footer { justify-content: center; gap: 1rem; font-size: 0.9rem; padding-top: 2rem; }
  .upload-footer .text-btn { font-size: 0.9rem; font-weight: 500; }
  .history-intro { margin: 1.5rem 1rem 1rem; }
  .history-intro h2 { font-size: 2.7rem; }
  .history-intro p { color: var(--muted); margin-top: 0.2rem; }
  .workspace-shell { display: contents; }
  .workspace-nav { background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 8px 25px #352b1b0a; margin: 0 auto 1.5rem; max-width: 560px; min-height: 88px; order: 0; padding: 1rem 1.4rem; width: 100%; }
  .workspace-nav h2 { font-size: 1.8rem; }
  .workspace-nav > div:first-child { min-width: 0; }
  .workspace-nav > div:first-child p, .workspace-nav :global(.note) { color: var(--muted); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .method-label { color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
  .workspace-body { order: 1; padding: 0; }
  @media (min-width: 1100px) { .workspace-body { margin-right: 265px; } }
  .workspace-header { background: #fff; border: 1px solid var(--border); border-radius: 999px; bottom: max(1.5rem, env(safe-area-inset-bottom)); box-shadow: 0 10px 30px #352b1b20; left: 50%; max-width: calc(100vw - 2rem); order: 2; padding: 0.4rem; position: fixed; transform: translateX(-50%); z-index: 20; }
  .workspace-actions { justify-content: center; flex-wrap: nowrap; }
  .view-toggle { background: transparent; border: 0; gap: 0.25rem; }
  .view-toggle button { border-radius: 12px; color: #384457; font-size: 1.65rem; height: 3rem; line-height: 1; min-width: 3rem; }
  .view-toggle button.active { background: #eaf0ff; box-shadow: none; color: var(--accent); }
  .opacity-tools { border-left: 1px solid var(--border); padding-left: 0.75rem; }
  .opacity-control input { width: 130px; }
  .play-btn { border-radius: 12px; font-weight: 500; min-height: 3rem; }
  .workspace-actions > .secondary-btn { white-space: nowrap; }
  .status-bar { background: #fff; border: 1px solid var(--border); border-radius: 999px; justify-self: center; margin-bottom: 1rem; order: 0; }
  .fab-area { align-items: center; bottom: 5.5rem; display: flex; gap: 0.75rem; position: fixed; right: max(1.5rem, calc((100vw - 1500px) / 2)); z-index: 21; }
  .fab { background: var(--accent); border: 0; border-radius: 50%; box-shadow: 0 8px 24px #3050d044; color: #fff; cursor: pointer; font-size: 2rem; height: 3.6rem; line-height: 1; width: 3.6rem; }
  .action-menu { background: #fff; border: 1px solid var(--border); border-radius: 14px; bottom: 4.2rem; box-shadow: 0 12px 35px #352b1b20; display: grid; min-width: 230px; padding: 0.5rem; position: absolute; right: 0; }
  .action-menu button { background: transparent; border: 0; border-radius: 8px; color: var(--text); cursor: pointer; padding: 0.75rem; text-align: left; }
  .menu-file { border-radius: 8px; color: var(--text); cursor: pointer; padding: 0.75rem; position: relative; }
  .menu-file:hover, .menu-file:focus-within { background: #eaf0ff; color: var(--accent); }
  .menu-file input { cursor: pointer; inset: 0; opacity: 0; position: absolute; width: 100%; }
  .action-menu button:hover, .action-menu button:focus-visible { background: #eaf0ff; color: var(--accent); }
  .action-menu button:disabled { color: var(--muted); cursor: not-allowed; opacity: 0.5; }
  .action-menu span { border-top: 1px solid var(--border); color: var(--muted); font-size: 0.72rem; margin-top: 0.35rem; padding: 0.8rem 0.75rem 0.25rem; }
  .modal-scrim { align-items: center; background: #161b27a6; display: flex; inset: 0; justify-content: center; padding: 1rem; position: fixed; z-index: 50; }
  .save-dialog { background: #fff; border-radius: 18px; box-shadow: 0 24px 60px #0003; max-height: calc(100dvh - 2rem); overflow: auto; width: min(100%, 520px); }
  .save-panel { background: transparent; border: 0; gap: 1rem; margin: 0; max-width: none; padding: 2rem; position: relative; }
  .save-panel h2 { font-size: 2rem; }
  .save-panel input, .save-panel textarea { border-radius: 8px; }
  .dialog-close { background: transparent; border: 0; color: var(--muted); cursor: pointer; font-size: 1.6rem; position: absolute; right: 1.5rem; top: 1.2rem; }
  @media (max-width: 820px) {
    .workspace-nav { align-items: center; flex-direction: row; }
    .workspace-header { flex-direction: row; }
    .workspace-actions { justify-content: center; width: auto; }
    .workspace-actions > button { flex: initial; }
    .fab-area { bottom: calc(6.5rem + env(safe-area-inset-bottom)); right: 1rem; }
  }
  @media (max-width: 540px) {
    .app-header { padding: 1rem; }
    .app-header h1 { font-size: 1.1rem; }
    .runtime-pill { font-size: 0.75rem; }
    .workspace-nav { margin-top: 0.5rem; }
    .workspace-nav h2 { font-size: 1.55rem; }
    .workspace-body { margin-right: 4.5rem; }
    .method-label { display: none; }
    .workspace-header { width: max-content; }
    .opacity-control span { display: none; }
    .opacity-control input { width: 70px; }
    .view-toggle button { min-width: 2.5rem; padding: 0.3rem; }
    .action-menu { max-width: calc(100vw - 6rem); min-width: 180px; }
    .modal-scrim { align-items: flex-end; padding: 0; }
    .save-dialog { border-radius: 18px 18px 0 0; max-height: calc(100dvh - env(safe-area-inset-top) - 1rem); padding-bottom: env(safe-area-inset-bottom); width: 100%; }
  }
</style>
