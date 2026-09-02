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

  let fileMeta = $derived(file ? `${file.name} · ${formatBytes(file.size)}` : '');

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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

  <span class="drop-header">
    <span>
      <span class="drop-label">{label}</span>
      <span class="drop-description">{description}</span>
    </span>
    <span class="drop-action">{previewUrl ? 'Change' : 'Browse'}</span>
  </span>

  {#if previewUrl}
    <span class="preview-frame">
      <img src={previewUrl} alt="{label} preview" />
    </span>
    <span class="file-meta">{fileMeta}</span>
  {:else}
    <span class="empty-state">
      <span>
        <span class="drop-icon" aria-hidden="true">+</span>
        <span class="drop-hint">Drop image here</span>
      </span>
    </span>
  {/if}

  {#if errorMsg}
    <span class="drop-error">{errorMsg}</span>
  {/if}
</label>

<style>
  .drop-zone {
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition:
      border-color 0.18s,
      box-shadow 0.18s,
      background 0.18s;
    position: relative;
    background: var(--surface);
    min-height: 260px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1rem;
    padding: 1rem;
  }

  .drop-zone:hover,
  .drop-zone.dragging {
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .drop-zone.dragging {
    background: #eef6ff;
  }

  input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .drop-header,
  .empty-state,
  .preview-frame,
  .file-meta,
  .drop-error {
    pointer-events: none;
  }

  .drop-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .drop-label,
  .drop-description,
  .drop-action,
  .file-meta,
  .drop-error,
  .empty-state {
    display: block;
  }

  .drop-label {
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .drop-description {
    color: var(--muted);
    font-size: 0.8rem;
    margin-top: 0.2rem;
  }

  .drop-action {
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.35rem 0.65rem;
    white-space: nowrap;
  }

  .empty-state {
    align-self: stretch;
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    color: var(--muted);
    display: grid;
    place-items: center;
    text-align: center;
  }

  .drop-icon {
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--accent);
    display: inline-grid;
    font-size: 1.5rem;
    font-weight: 300;
    height: 3rem;
    line-height: 1;
    margin-bottom: 0.6rem;
    place-items: center;
    width: 3rem;
  }

  .drop-hint {
    display: block;
    font-size: 0.88rem;
    font-weight: 600;
  }

  .preview-frame {
    align-self: stretch;
    background:
      linear-gradient(45deg, #f0f2f5 25%, transparent 25%),
      linear-gradient(-45deg, #f0f2f5 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #f0f2f5 75%),
      linear-gradient(-45deg, transparent 75%, #f0f2f5 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-size: 20px 20px;
    border: 1px solid var(--border);
    border-radius: 6px;
    display: grid;
    min-height: 170px;
    overflow: hidden;
    place-items: center;
  }

  .preview-frame img {
    display: block;
    max-height: 260px;
    max-width: 100%;
    object-fit: contain;
  }

  .file-meta {
    color: var(--muted);
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drop-error {
    color: var(--danger);
    font-size: 0.78rem;
    font-weight: 700;
  }

  @media (max-width: 720px) {
    .drop-zone {
      min-height: 220px;
    }

    .preview-frame img {
      max-height: 220px;
    }
  }
</style>
