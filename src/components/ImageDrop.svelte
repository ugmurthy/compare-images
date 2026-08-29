<script lang="ts">
  let { label, onselect }: { label: string; onselect: (file: File) => void } = $props();

  let dragging: boolean = $state(false);
  let fileName: string = $state('');

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      fileName = file.name;
      onselect(file);
    }
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
    const file = input.files?.[0];
    if (file) {
      fileName = file.name;
      onselect(file);
    }
  }
</script>

<div
  class="drop-zone"
  class:dragging
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  <div class="drop-content">
    <div class="drop-icon">📷</div>
    <p class="drop-label">{label}</p>
    {#if fileName}
      <p class="drop-filename">{fileName}</p>
    {:else}
      <p class="drop-hint">Drop an image here or click to browse</p>
    {/if}
  </div>
  <input type="file" accept="image/*" onchange={handleChange} />
</div>

<style>
  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    background: var(--surface);
    min-height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .drop-zone:hover,
  .drop-zone.dragging {
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.05);
  }

  .drop-content {
    pointer-events: none;
  }
  .drop-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  .drop-label {
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }
  .drop-hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .drop-filename {
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 500;
  }

  input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
</style>
