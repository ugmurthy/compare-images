<script lang="ts">
  let {
    label,
    description,
    previewUrl = '',
    file = null,
    onselect
  }: {
    label: string;
    description: string;
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
    <span class="preview-frame">
      <img src={previewUrl} alt="{label} preview" />
    </span>
    <span class="file-meta"><strong>{label}</strong> · {file?.name}<span>Replace</span></span>
  {:else}
    <span class="empty-state">
      <span class="drop-icon" aria-hidden="true">↥</span>
      <strong>{label}</strong>
      <span>{description}</span>
      <span class="drop-hint">Drop an image or <em>browse</em></span>
    </span>
  {/if}

  {#if errorMsg}
    <span class="drop-error">{errorMsg}</span>
  {/if}
</label>

<style>
  .drop-zone {
    border: 1px solid var(--border);
    border-radius: 14px;
    cursor: pointer;
    position: relative;
    background: var(--surface);
    box-shadow: 0 8px 24px rgba(36, 31, 22, 0.05);
    min-height: 340px;
    display: grid;
    grid-template-rows: 1fr auto;
    padding: 8px;
  }
  .drop-zone:hover, .drop-zone.dragging { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    z-index: 1;
  }
  .empty-state, .preview-frame, .file-meta, .drop-error { pointer-events: none; }
  .empty-state {
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    grid-row: 1 / 3;
    text-align: center;
  }
  .empty-state strong { color: var(--text); font-size: 1.05rem; }
  .drop-icon { font-size: 3.5rem; line-height: 1; margin-bottom: 1rem; }
  .drop-hint { margin-top: 1rem; }
  .drop-hint em { color: var(--accent); font-style: normal; }
  .preview-frame {
    border-radius: 10px;
    display: block;
    height: 340px;
    overflow: hidden;
  }
  .preview-frame img { display: block; height: 100%; width: 100%; object-fit: contain; background: #f7f6f3; }
  .file-meta {
    font-size: 0.82rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.8rem 0.5rem 0.4rem;
  }
  .file-meta span { color: var(--accent); float: right; }
  .drop-error { color: var(--danger); font-size: 0.8rem; }
  @media (max-width: 720px) { .drop-zone { min-height: 260px; } .preview-frame { height: 260px; } }
</style>
