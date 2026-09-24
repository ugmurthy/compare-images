<script lang="ts">
  import type { HistoryEntry } from '../lib/history';
  import NotePreview from './NotePreview.svelte';

  let { entries, onopen }: { entries: HistoryEntry[]; onopen: (entry: HistoryEntry, reference: File, source: File) => Promise<void> } = $props();
  let project = $state('');
  let selectedId = $state('');
  let referenceFile: File | null = $state(null);
  let sourceFile: File | null = $state(null);
  let opening = $state(false);
  let error = $state('');

  let projects = $derived([...new Map(entries.map((entry) => [`${entry.projectName}\0${entry.reference.name}`, {
    key: `${entry.projectName}\0${entry.reference.name}`, name: entry.projectName, reference: entry.reference.name
  }])).values()]);
  let activeProject = $derived(projects.find((item) => item.key === project) ?? projects[0]);
  let projectEntries = $derived(entries.filter((entry) => entry.projectName === activeProject?.name && entry.reference.name === activeProject?.reference));
  let selected = $derived(projectEntries.find((entry) => entry.id === selectedId) ?? projectEntries[0]);

  function chooseEntry(id: string) {
    selectedId = id;
    referenceFile = null;
    sourceFile = null;
    error = '';
  }

  async function open() {
    if (!selected || !referenceFile || !sourceFile) return;
    opening = true;
    error = '';
    try { await onopen(selected, referenceFile, sourceFile); }
    catch (cause) { error = (cause as Error).message; }
    finally { opening = false; }
  }
</script>

<section class="history" aria-label="History">
  <aside class="card">
    <h2>Projects</h2>
    {#each projects as item}
      <button class:active={activeProject?.key === item.key} onclick={() => { project = item.key; chooseEntry(''); }}>
        <strong>{item.name}</strong><small>Reference: {item.reference}</small>
      </button>
    {/each}
  </aside>
  <div class="card entries">
    <h2>History</h2><p>Saved alignments on this browser.</p>
    {#if !entries.length}<p>No comparisons saved yet. Align two images and save from the comparison view.</p>{/if}
    {#each projectEntries as entry}
      <button class:active={selected?.id === entry.id} onclick={() => chooseEntry(entry.id)}>
        <strong>{new Date(entry.createdAt).toLocaleString()}</strong>
        <small>{entry.alignment.method} alignment · {entry.parts.length} saved parts · {entry.source.name}</small>
        <NotePreview note={entry.note} focusable={false} />
      </button>
    {/each}
  </div>
  {#if selected}
    {#key selected.id}
    <div class="card reopen">
      <h2>{new Date(selected.createdAt).toLocaleString()}</h2>
      <NotePreview note={selected.note} />
      <p>{selected.parts.length} saved parts</p>
      <h3>Reopen this comparison</h3>
      <p>Images are not stored. Select the same files to reopen without realigning.</p>
      <label>Reference · {selected.reference.name}<input type="file" accept="image/*" onchange={(event) => referenceFile = event.currentTarget.files?.[0] ?? null} /></label>
      <label>Source · {selected.source.name}<input type="file" accept="image/*" onchange={(event) => sourceFile = event.currentTarget.files?.[0] ?? null} /></label>
      <button class="primary" onclick={open} disabled={!referenceFile || !sourceFile || opening}>{opening ? 'Opening…' : 'Open comparison'}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
    {/key}
  {/if}
</section>

<style>
  .history { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(250px, 2fr) minmax(270px, 1.5fr); gap: 0.85rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; min-width: 0; padding: 1rem; }
  h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
  h3 { font-size: 0.95rem; margin: 1.25rem 0 0.35rem; }
  p, small { color: var(--muted); font-size: 0.78rem; }
  .card > button:not(.primary) { background: #fff; border: 1px solid var(--border); border-radius: 7px; color: var(--text); cursor: pointer; display: block; margin: 0.6rem 0; padding: 0.75rem; text-align: left; width: 100%; }
  .card > button.active { background: #edf4ff; border-color: var(--accent); }
  .card button strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card button small { display: block; overflow-wrap: anywhere; }
  .entries button :global(.note) { color: var(--muted); font-size: 0.78rem; margin-top: 0.3rem; }
  .reopen :global(.full) { left: auto; right: 0; }
  label { display: grid; font-size: 0.78rem; font-weight: 750; gap: 0.45rem; margin: 1rem 0; overflow-wrap: anywhere; }
  input { max-width: 100%; }
  .primary { background: var(--accent); border: 0; border-radius: 6px; color: white; cursor: pointer; font-weight: 800; min-height: 44px; padding: 0.6rem; width: 100%; }
  .primary:disabled { opacity: 0.5; }
  .error { color: var(--danger); }
  @media (max-width: 820px) { .history { grid-template-columns: 1fr; } }
</style>
