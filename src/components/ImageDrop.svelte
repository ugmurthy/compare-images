<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    label,
    description,
    step,
    tone = 'reference',
    previewUrl = '',
    file = null,
    onselect
  }: {
    label: string;
    description: string;
    step?: number;
    tone?: 'reference' | 'source';
    previewUrl?: string;
    file?: File | null;
    onselect: (file: File) => void;
  } = $props();

  let dragging: boolean = $state(false);
  let errorMsg: string = $state('');

  function selectFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      errorMsg = 'Choose an image file.';
      return;
    }
    errorMsg = '';
    onselect(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    selectFile(e.dataTransfer?.files?.[0]);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleChange(e: Event) {
    const input = e.target as HTMLInputElement;
    selectFile(input.files?.[0]);
  }
</script>

<label
  class="drop-zone"
  class:dragging
  class:has-preview={!!previewUrl}
  aria-label="{label} upload"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  <input type="file" accept="image/*" onchange={handleChange} />

  {#if previewUrl}
    <span class="file-meta">
      <span class="swatch {tone}" aria-hidden="true"></span>
      <strong>{label}</strong>
      <span class="file-name">{file?.name}</span>
      <span class="replace"><Icon name="replace-reference" size={16} />Replace</span>
    </span>
    <span class="preview-frame">
      <img src={previewUrl} alt="{label} preview" />
    </span>
  {:else}
    <span class="empty-state">
      <span class="drop-icon" aria-hidden="true"><Icon name="upload" size={26} /></span>
      {#if step}<span class="step">Step {step}</span>{/if}
      <strong>{label}</strong>
      <span class="description">{description}</span>
      <span class="drop-hint">Drop an image here or <em>browse files</em></span>
    </span>
  {/if}

  {#if errorMsg}
    <span class="drop-error" role="alert">{errorMsg}</span>
  {/if}
</label>

<style>
  .drop-zone {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    min-height: 360px;
    overflow: hidden;
    position: relative;
    transition: border-color 160ms var(--ease), box-shadow 160ms var(--ease);
  }
  .drop-zone:not(.has-preview) { padding: 10px; }
  .drop-zone:hover, .drop-zone.dragging { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-tint), var(--shadow); }
  input[type="file"] { cursor: pointer; inset: 0; opacity: 0; position: absolute; width: 100%; z-index: 1; }
  .empty-state, .preview-frame, .file-meta, .drop-error { pointer-events: none; }
  .empty-state {
    align-items: center;
    border: 1.5px dashed var(--dash);
    border-radius: var(--radius);
    color: var(--ink-muted);
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.35rem;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;
    transition: background 160ms var(--ease), border-color 160ms var(--ease);
  }
  .drop-zone:hover .empty-state, .dragging .empty-state { background: var(--accent-tint); border-color: var(--accent); }
  .drop-icon { align-items: center; background: var(--accent-tint); border-radius: 50%; color: var(--accent); display: flex; height: 56px; justify-content: center; margin-bottom: 0.75rem; width: 56px; }
  .step { color: var(--accent); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .empty-state strong { color: var(--ink); font-size: 1.15rem; font-weight: 600; }
  .description { max-width: 28ch; }
  .drop-hint { font-size: 0.85rem; margin-top: 0.9rem; }
  .drop-hint em { color: var(--accent); font-style: normal; font-weight: 500; }
  .file-meta { align-items: center; border-bottom: 1px solid var(--hairline); display: flex; font-size: 0.85rem; gap: 0.5rem; min-height: 48px; min-width: 0; padding: 0.5rem 0.85rem; }
  .swatch { border-radius: 3px; flex: none; height: 10px; width: 10px; }
  .file-name { color: var(--ink-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .replace { align-items: center; border-radius: 8px; color: var(--accent); display: inline-flex; font-weight: 500; gap: 0.35rem; margin-left: auto; padding: 0.35rem 0.5rem; white-space: nowrap; }
  .drop-zone:hover .replace { background: var(--accent-tint); }
  .preview-frame { background: var(--canvas-bg); display: block; flex: 1; min-height: 0; padding: 10px; }
  .preview-frame img { display: block; height: 100%; max-height: 360px; object-fit: contain; width: 100%; }
  .drop-error { bottom: 12px; color: var(--danger); font-size: 0.8rem; left: 0; position: absolute; right: 0; text-align: center; }
  @media (max-width: 720px) { .drop-zone { min-height: 240px; } .preview-frame img { max-height: 240px; } }
</style>
