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
  import ModeSwitch from './components/ModeSwitch.svelte';
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
    projectName = currentEntry?.projectName ?? refFile?.name.replace(/\.[^.]+$/, '') ?? '';
    entryNote = '';
    partName = '';
    partNote = '';
    savePanel = true;
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
      savePanel = false;
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
      savePanel = false;
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
  <div>
    <p class="eyebrow">Sketch comparison</p>
    <h1>Compare Sketch</h1>
  </div>
  <div class="header-actions">
    <button class="secondary-btn" onclick={() => { historyOpen = !historyOpen; savePanel = false; }}>{historyOpen ? 'Back to comparison' : 'History'}</button>
    <span class="runtime-pill" class:ready={cvState === 'ready'} class:error={cvState === 'error'}>
      <span class="runtime-dot"></span>{runtimeLabel}
    </span>
  </div>
</header>

<main>
  {#if historyOpen}
    <HistoryView entries={historyEntries} onopen={openHistoryEntry} ondelete={removeHistoryEntry} />
  {:else if !refImg || !srcImg}
    <section class="upload-section">
      <div class="intro">
        <p class="eyebrow">Start a comparison</p>
        <h2>Choose two images</h2>
        <p>Add an original reference and the source you want to inspect.</p>
      </div>
      <div class="upload-grid">
        <ImageDrop label="Reference" description="Original sketch" previewUrl={refUrl} file={refFile} onselect={(file) => loadSelectedImage(file, 'ref')} />
        <ImageDrop label="Source" description="Sketch with changes" previewUrl={srcUrl} file={srcFile} onselect={(file) => loadSelectedImage(file, 'src')} />
      </div>
      <div class="upload-footer">
        <span>{selectedCount}/2 selected</span>
        <button class="text-btn" onclick={clearAll} disabled={!refFile && !srcFile}>Reset</button>
      </div>
    </section>
  {:else if showingParts && selectedRegion && activeResult}
    <PartsView reference={refImg} aligned={activeResult.aligned} region={selectedRegion} onback={closeParts}
      parts={savedParts} selectedPart={selectedPart} onprevious={() => adjacentPart(-1)} onnext={() => adjacentPart(1)}
      onsave={showSavePanel} />
    {#if savePanel}
      <form class="save-panel" onsubmit={(event) => { event.preventDefault(); void savePart(); }}>
        <h3>Save this part</h3>
        {#if !currentEntry}
          <p>This will also create a comparison entry for the current alignment.</p>
          <label>Project name <input bind:value={projectName} list="matching-projects" required /></label>
          <datalist id="matching-projects">{#each matchingProjects as name}<option value={name}></option>{/each}</datalist>
          <label>Entry note (optional) <textarea bind:value={entryNote}></textarea></label>
        {:else}<p>Add to {currentEntry.projectName} · {new Date(currentEntry.createdAt).toLocaleString()}</p>{/if}
        <label>Part name <input bind:value={partName} required /></label>
        <label>Part note (optional) <textarea bind:value={partNote}></textarea></label>
        <div class="save-actions"><button type="button" class="secondary-btn" onclick={() => savePanel = false}>Cancel</button><button class="primary-btn" disabled={saving}>Add part to entry</button></div>
        {#if errorMsg}<p class="save-error" role="alert">{errorMsg}</p>{/if}
      </form>
    {/if}
  {:else}
    <section class="image-strip" aria-label="Selected images">
      <div class="image-summary">
        <img src={refUrl} alt="Reference thumbnail" />
        <span><strong>Reference</strong><small>{refFile?.name}</small></span>
        <label class="replace-btn">Replace<input type="file" accept="image/*" onchange={(event) => handleCompactFile(event, 'ref')} /></label>
      </div>
      <div class="image-summary">
        <img src={srcUrl} alt="Source thumbnail" />
        <span><strong>Source</strong><small>{srcFile?.name}</small></span>
        <label class="replace-btn">Replace<input type="file" accept="image/*" onchange={(event) => handleCompactFile(event, 'src')} /></label>
      </div>
      <button class="text-btn" onclick={clearAll}>New comparison</button>
    </section>

    <section class="workspace-shell">
      {#if currentEntry && currentEntry.alignment.method === comparisonMode}
        <div class="saved-context">
          <strong>{currentEntry.projectName} · {new Date(currentEntry.createdAt).toLocaleString()}</strong>
          <NotePreview note={currentEntry.note} />
          <span>Saved alignment restored or recorded · {savedParts.length} parts</span>
        </div>
      {/if}
      <div class="workspace-nav">
        <div>
          <h2>Comparison workspace</h2>
          <p>Choose how you want to inspect these images.</p>
        </div>
        <ModeSwitch value={comparisonMode} onchange={selectMode} />
      </div>

      <div class="workspace-header">
        <div>
          {#if comparisonMode === 'visual'}
            <h3>Original images</h3>
            <p>No alignment or processing applied.</p>
          {:else if comparisonMode === 'manual' && manualEditing}
            <h3>Manual alignment</h3>
            <p>Place at least four matching point pairs across the images.</p>
          {:else if comparisonMode === 'manual'}
            <h3>Manual alignment result</h3>
            <p>{manualResult?.inlierCount ?? 0} anchor inliers.</p>
          {:else}
            <h3>Automatic alignment</h3>
            <p>{autoResult ? `${autoResult.inlierCount} feature inliers.` : 'Let OpenCV match and align the source.'}</p>
          {/if}
        </div>

        <div class="workspace-actions">
          {#if activeResult && !(comparisonMode === 'manual' && manualEditing)}
            <div class="view-toggle" aria-label="Result display">
              <button class:active={viewMode === 'side-by-side'} onclick={() => selectViewMode('side-by-side')}>Side by side</button>
              <button class:active={viewMode === 'overlay'} onclick={() => selectViewMode('overlay')}>Overlay</button>
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
            <button class="secondary-btn" onclick={showSavePanel} disabled={restoredMethod === comparisonMode}>Save comparison</button>
          {/if}

          {#if comparisonMode === 'manual'}
            {#if manualEditing}
              <button
                class="primary-btn"
                onclick={() => processImages('manual')}
                disabled={completeManualAnchors.length < 4 || cvState !== 'ready' || processingMode !== null}
              >
                {processingMode === 'manual' ? 'Aligning…' : `Apply ${completeManualAnchors.length} anchors`}
              </button>
            {:else}
              <button class="secondary-btn" onclick={() => manualEditing = true} disabled={restoredMethod === 'manual'}>Edit anchors</button>
            {/if}
          {:else if comparisonMode === 'auto'}
            <button
              class="primary-btn"
              onclick={() => processImages('auto')}
              disabled={cvState !== 'ready' || processingMode !== null}
              aria-busy={processingMode === 'auto'}
            >
              {#if processingMode === 'auto'}<span class="spinner light" aria-hidden="true"></span>{/if}
              {processingMode === 'auto' ? 'Aligning…' : autoResult ? 'Run again' : 'Auto align'}
            </button>
          {/if}
        </div>
      </div>

      {#if savePanel}
        <form class="save-panel" onsubmit={(event) => { event.preventDefault(); void saveComparison(); }}>
          <h3>Save comparison</h3>
          <p>Save this alignment as a new timestamped entry. Images remain on your device.</p>
          <label>Project name <input bind:value={projectName} list="matching-projects" required /></label>
          <datalist id="matching-projects">{#each matchingProjects as name}<option value={name}></option>{/each}</datalist>
          <label>Entry note (optional) <textarea bind:value={entryNote}></textarea></label>
          <div class="save-actions"><button type="button" class="secondary-btn" onclick={() => savePanel = false}>Cancel</button><button class="primary-btn" disabled={saving}>Save entry</button></div>
          {#if errorMsg}<p class="save-error" role="alert">{errorMsg}</p>{/if}
        </form>
      {/if}

      <div id="comparison-workspace" class="workspace-body" class:with-parts={savedParts.length > 0 && activeResult && !(comparisonMode === 'manual' && manualEditing)} role="tabpanel">
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
          />
        {:else}
          <CompareView
            {refImg}
            {srcImg}
            alignResult={comparisonMode === 'visual' ? null : activeResult}
            viewMode={comparisonMode === 'visual' || !activeResult ? 'side-by-side' : viewMode}
            {overlayOpacity}
            onrotatesource={comparisonMode === 'visual' ? rotateSource : undefined}
            {sourceRotating}
            bind:region={selectedRegion}
            savedRegions={savedParts.map((part) => part.region)}
            oncompareparts={compareParts}
          />
          {#if savedParts.length && activeResult}
            <aside class="saved-parts">
              <h3>Saved parts ({savedParts.length})</h3>
              {#each savedParts as part, index}
                <button onclick={() => openSavedPart(part)}>
                  <strong>{index + 1}. {part.name} →</strong>
                  <NotePreview note={part.note} focusable={false} />
                </button>
              {/each}
            </aside>
          {/if}
        {/if}
      </div>

      {#if statusMsg || errorMsg}
        <div class="status-bar" class:error={!!errorMsg}>
          <span class="status-dot"></span>
          <span>{errorMsg || statusMsg}</span>
          {#if cvState === 'error'}<button onclick={loadCv}>Retry</button>{/if}
        </div>
      {/if}
    </section>
  {/if}
</main>

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

  h1, h2, h3, p { margin: 0; }
  h1 { font-size: 1.45rem; font-weight: 850; letter-spacing: -0.025em; }
  h2 { font-size: 1.15rem; }
  h3 { font-size: 0.98rem; }

  .eyebrow {
    color: var(--accent);
    font-size: 0.68rem;
    font-weight: 850;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

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

  .upload-section, .workspace-shell, .image-strip {
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

  .image-strip {
    align-items: stretch;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    padding: 0.55rem;
  }

  .image-summary {
    align-items: center;
    background: #f8fafc;
    border-radius: 7px;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: 2.8rem minmax(0, 1fr) auto;
    min-width: 0;
    padding: 0.35rem;
  }

  .image-summary img { background: #fff; border: 1px solid var(--border); border-radius: 5px; height: 2.35rem; object-fit: contain; width: 2.8rem; }
  .image-summary span { min-width: 0; }
  .image-summary strong, .image-summary small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .image-summary strong { font-size: 0.76rem; }
  .image-summary small { color: var(--muted); font-size: 0.68rem; margin-top: 0.1rem; }

  .replace-btn, .text-btn {
    background: transparent;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.5rem;
    position: relative;
  }
  .replace-btn input { inset: 0; opacity: 0; position: absolute; width: 100%; }
  .text-btn:disabled { cursor: not-allowed; opacity: 0.45; }

  .workspace-shell { overflow: visible; }
  .saved-context { border-bottom: 1px solid var(--border); display: grid; gap: 0.2rem; padding: 0.75rem 1rem; }
  .saved-context strong { font-size: 0.85rem; }
  .saved-context span { color: var(--muted); font-size: 0.76rem; }
  .workspace-nav, .workspace-header {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.85rem 1rem;
  }
  .workspace-nav { border-bottom: 1px solid var(--border); }
  .workspace-nav > div:first-child p, .workspace-header p { color: var(--muted); font-size: 0.76rem; margin-top: 0.2rem; }
  .workspace-nav :global(.mode-switch) { min-width: min(100%, 530px); }
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
  .spinner {
    animation: spin 0.75s linear infinite;
    border: 2px solid #d7dee7;
    border-radius: 50%;
    border-top-color: var(--accent);
    display: inline-block;
    flex: 0 0 auto;
    height: 0.9rem;
    width: 0.9rem;
  }
  .spinner.light { border-color: rgba(255, 255, 255, 0.4); border-top-color: #fff; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .workspace-body { padding: 0.85rem; }
  .workspace-body.with-parts { display: grid; gap: 0.85rem; grid-template-columns: minmax(0, 1fr) minmax(220px, 260px); }
  .saved-parts { border: 1px solid var(--border); border-radius: 8px; min-width: 0; padding: 0.85rem; }
  .saved-parts button { background: #fff; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; display: block; margin-top: 0.6rem; padding: 0.65rem; text-align: left; width: 100%; }
  .saved-parts button:hover, .saved-parts button:focus-visible { border-color: var(--accent); }
  .saved-parts strong { display: block; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .saved-parts button :global(.note) { color: var(--muted); font-size: 0.75rem; margin-top: 0.25rem; }
  .saved-parts :global(.full) { left: auto; right: 0; }
  .save-panel { background: #f8fbff; border: 1px solid var(--border); border-radius: 8px; display: grid; gap: 0.7rem; margin: 0.85rem; max-width: 600px; padding: 1rem; }
  main > .save-panel { margin: 0; }
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
    .image-strip { grid-template-columns: 1fr; }
    .workspace-nav, .workspace-header { align-items: stretch; flex-direction: column; }
    .workspace-actions, .workspace-nav :global(.mode-switch) { justify-content: stretch; width: 100%; }
    .workspace-actions > button, .view-toggle { flex: 1; }
    .view-toggle button { flex: 1; }
    .workspace-body.with-parts { grid-template-columns: 1fr; }
    .opacity-tools { justify-content: space-between; width: 100%; }
    .opacity-control { flex: 1; }
    .opacity-control input { flex: 1; width: auto; }
  }

  @media (max-width: 540px) {
    .runtime-pill { font-size: 0; }
    .runtime-dot { height: 0.6rem; width: 0.6rem; }
    .workspace-body { padding: 0.5rem; }
  }
</style>
