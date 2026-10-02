<script lang="ts">
  import type { HistoryEntry } from '../lib/history';
  import Icon from './Icon.svelte';
  import NotePreview from './NotePreview.svelte';

  let { entries, onopen, oncreate, ondelete, onstart }: {
    entries: HistoryEntry[];
    onopen: (entry: HistoryEntry) => Promise<void>;
    oncreate: (entry: HistoryEntry) => Promise<void>;
    ondelete: (id: string) => Promise<void>;
    onstart: () => void;
  } = $props();
  let project = $state('');
  let selectedId = $state('');
  let opening = $state(false);
  let deletingId: string | null = $state(null);
  let downloading = $state(false);
  let downloadStatus = $state('');
  let busy = $derived(opening || deletingId !== null || downloading);
  let error = $state('');
  let level: 'projects' | 'entries' | 'detail' = $state('projects');

  let projects = $derived([...new Map(entries.map((entry) => [`${entry.projectName}\0${entry.reference.name}`, {
    key: `${entry.projectName}\0${entry.reference.name}`, name: entry.projectName, reference: entry.reference.name
  }])).values()]);
  let activeProject = $derived(projects.find((item) => item.key === project) ?? projects[0]);
  let projectEntries = $derived(entries.filter((entry) => entry.projectName === activeProject?.name && entry.reference.name === activeProject?.reference));
  let selected = $derived(projectEntries.find((entry) => entry.id === selectedId) ?? projectEntries[0]);

  function chooseEntry(id: string) {
    selectedId = id;
    level = 'detail';
    error = '';
  }

  async function open(entry = selected, create = false) {
    if (!entry || busy) return;
    opening = true;
    error = '';
    try { await (create ? oncreate(entry) : onopen(entry)); }
    catch (cause) { error = (cause as Error).message; }
    finally { opening = false; }
  }

  async function remove(entry: HistoryEntry) {
    if (busy) return;
    if (!window.confirm(`Delete this comparison from ${entry.projectName}, including its ${entry.parts.length} saved parts? This cannot be undone.`)) return;
    const wasSelected = selected?.id === entry.id;
    deletingId = entry.id;
    error = '';
    try {
      await ondelete(entry.id);
      if (wasSelected) chooseEntry('');
    } catch (cause) { error = (cause as Error).message; }
    finally { deletingId = null; }
  }

  async function downloadSources() {
    if (busy || !projectEntries.length) return;
    const selectedEntries = [...projectEntries];
    downloading = true;
    error = '';
    downloadStatus = 'Preparing aligned sources…';
    try {
      const { downloadAlignedSources } = await import('../lib/alignedExport');
      downloadStatus = await downloadAlignedSources(selectedEntries, (message) => downloadStatus = message);
    } catch (cause) {
      downloadStatus = '';
      error = (cause as Error).message;
    } finally { downloading = false; }
  }
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if downloadStatus}<p class="download-status" role="status">{downloadStatus}</p>{/if}
<section class="history" aria-label="History">
  {#if !entries.length}<div class="empty"><p>No saved comparisons yet.</p><button onclick={onstart}>Start a comparison</button></div>{:else}
  <aside class="card" class:mobile-hidden={level !== 'projects'}>
    <h2>Projects</h2>
    {#each projects as item}
      {@const count = entries.filter((entry) => entry.projectName === item.name && entry.reference.name === item.reference).length}
      <button class:active={activeProject?.key === item.key} disabled={downloading} onclick={() => { project = item.key; selectedId = ''; level = 'entries'; downloadStatus = ''; error = ''; }}>
        <strong>▤ &nbsp; {item.name}</strong><small>{count} {count === 1 ? 'entry' : 'entries'}</small>
      </button>
    {/each}
  </aside>
  <div class="card entries" class:mobile-hidden={level !== 'entries'}>
    <button class="level-back" onclick={() => level = 'projects'}>← Projects</button>
    <div class="entries-heading">
      <h2>Entries</h2>
      <button class="download-sources" onclick={downloadSources} disabled={busy}
        aria-label={`Download aligned sources for ${activeProject?.name}`} title="Download aligned sources — newest capture first, up to 99 PNGs in a ZIP">
        <Icon name="export" />
      </button>
    </div>
    <button class="new-entry" onclick={() => open(projectEntries[0], true)} disabled={busy}
      aria-label={`New comparison in ${activeProject?.name} using existing reference`} title="New comparison using existing reference">
      <Icon name="plus" />
    </button>
    {#each projectEntries as entry}
      <div class="entry-row" class:active={selected?.id === entry.id}>
        <div class="entry-content">
          <button class="image-open entry-preview" onclick={() => open(entry)} disabled={busy} aria-label={`Open comparison from ${new Date(entry.createdAt).toLocaleString()}`}>
            <span class="thumbnails"><img src={entry.reference.thumbnail} alt="Reference preview" /><img src={entry.source.thumbnail} alt="Source preview" /></span>
          </button>
          <button class="entry-select" onclick={() => chooseEntry(entry.id)} disabled={busy} title={entry.note}>
            <strong>{new Date(entry.createdAt).toLocaleString()}</strong>
            <small>{entry.alignment.method === 'auto' ? 'Auto align' : 'Manual anchors'} &nbsp; · &nbsp; {entry.parts.length} {entry.parts.length === 1 ? 'part' : 'parts'}</small>
            <NotePreview note={entry.note} focusable={false} />
          </button>
        </div>
        <button class="delete" onclick={() => remove(entry)} disabled={busy} aria-label={`Delete entry from ${new Date(entry.createdAt).toLocaleString()}`} title="Delete entry">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4l1 4H9l1-4ZM6 7l1 14h10l1-14M10 11v6m4-6v6" /></svg>
        </button>
      </div>
    {/each}
  </div>
  {#if selected}
    {#key selected.id}
    <div class="card reopen" class:mobile-hidden={level !== 'detail'}>
      <button class="level-back" onclick={() => level = 'entries'}>← Entries</button>
      <h2>{new Date(selected.createdAt).toLocaleString()}</h2>
      <p>{selected.alignment.method === 'auto' ? 'Auto align' : 'Manual anchors'} &nbsp; · &nbsp; {selected.reference.name} → {selected.source.name}</p>
      <NotePreview note={selected.note} />
      <button class="image-open" onclick={() => open()} disabled={busy} aria-label="Open comparison from image previews">
        <span class="thumbnails large"><img src={selected.reference.thumbnail} alt={selected.reference.name} /><img src={selected.source.thumbnail} alt={selected.source.name} /></span>
      </button>
      {#if selected.parts.length}
        <h3>Saved parts ({selected.parts.length})</h3>
        <ul>{#each selected.parts as part}<li><button class="part-open" onclick={() => open()} disabled={busy} title={`${part.name}${part.note ? `\n${part.note}` : ''}\nOpen comparison`}><img class="part-thumbnail" src={part.thumbnail} alt={`Reference region: ${part.name}`} /><span>{part.name}</span></button></li>{/each}</ul>
      {/if}
      <p>Both images are saved. Reopen without realigning.</p>
      <button class="primary" onclick={() => open()} disabled={busy}>{opening ? 'Opening…' : 'Open comparison'}</button>
    </div>
    {/key}
  {/if}
  {/if}
</section>

<style>
  .thumbnails { display: flex; gap: 0.4rem; margin: 0.5rem 0; }
  .thumbnails img { background: #f7f6f3; border: 1px solid var(--border); border-radius: 6px; height: 60px; object-fit: contain; width: calc(50% - 0.2rem); }
  .large img { height: 130px; }
  .part-thumbnail { border-radius: 6px; height: 48px; object-fit: contain; width: 64px; }
  .empty { grid-column: 1 / -1; padding: 5rem 1.5rem; text-align: center; }
  .empty button { background: var(--surface); color: var(--text); border: 1px solid var(--hairline); border-radius: 8px; cursor: pointer; margin-top: 16px; padding: 10px 16px; min-height: 44px; }
  .card > .level-back { display: none; }
  .history { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); display: grid; grid-template-columns: minmax(170px, 0.8fr) minmax(250px, 1.1fr) minmax(270px, 1.7fr); min-height: 580px; overflow: hidden; margin-top: 16px; }
  .card { background: var(--surface); border-right: 1px solid var(--border); min-width: 0; padding: 1.5rem; }
  .card:last-child { border-right: 0; }
  h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 1rem; }
  h3 { font-size: 0.95rem; margin: 1.25rem 0 0.35rem; }
  .entries-heading { align-items: center; display: flex; justify-content: space-between; margin: -0.5rem 0 0.5rem; }
  .entries-heading h2 { margin: 0; }
  .download-sources { align-items: center; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--accent); cursor: pointer; display: flex; justify-content: center; min-height: 44px; min-width: 44px; }
  .download-sources:hover { background: var(--accent-tint); }
  .download-sources:disabled, .card > button:disabled { cursor: not-allowed; opacity: 0.5; }
  .download-status { overflow-wrap: anywhere; }
  p, small { color: var(--muted); font-size: 0.82rem; line-height: 1.5; }
  .card > button:not(.primary, .level-back, .image-open, .new-entry) { background: var(--surface); border: 0; border-radius: 10px; color: var(--text); cursor: pointer; display: block; margin: 0.6rem 0; padding: 0.75rem; text-align: left; width: 100%; min-height: 44px; }
  .card > button.active { background: var(--accent-tint); box-shadow: inset 3px 0 var(--accent); }
  .card button strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card button small { display: block; overflow-wrap: anywhere; }
  .new-entry { align-items: center; background: transparent; border: 1px dashed var(--border-strong); border-radius: 8px; color: var(--accent); cursor: pointer; display: flex; justify-content: center; margin: 0 0 0.75rem; min-height: 100px; width: 100%; }
  .new-entry:hover { background: var(--accent-tint); border-color: var(--accent); }
  .new-entry:disabled { cursor: not-allowed; opacity: 0.5; }
  .new-entry :global(svg) { height: 28px; width: 28px; }
  .entry-row { align-items: center; background: var(--surface); border-bottom: 1px solid var(--border); border-radius: 8px; display: flex; margin: 0.2rem 0; min-width: 0; }
  .entry-row.active { background: var(--accent-tint); box-shadow: inset 3px 0 var(--accent); }
  .entry-content { flex: 1; min-width: 0; }
  .image-open.entry-preview { padding: 0.75rem 0.75rem 0; box-sizing: border-box; }
  .entry-select { background: transparent; border: 0; color: var(--text); cursor: pointer; flex: 1; min-width: 0; padding: 0.75rem; text-align: left; }
  .entry-select:disabled { cursor: not-allowed; }
  .entry-select :global(.note) { color: var(--muted); font-size: 0.78rem; margin-top: 0.3rem; }
  .image-open, .part-open { background: transparent; border: 0; color: var(--text); cursor: pointer; padding: 0; text-align: left; width: 100%; }
  .part-open { align-items: center; border-radius: 8px; display: flex; gap: 0.75rem; padding: 0.5rem; }
  .part-open span { overflow-wrap: anywhere; min-width: 0; }
  .part-open:hover { background: var(--accent-tint); }
  .image-open:disabled, .part-open:disabled { cursor: not-allowed; opacity: 0.5; }
  .primary { background: var(--accent); border: 0; border-radius: 8px; color: var(--on-accent); cursor: pointer; font-weight: 600; min-height: 44px; padding: 0.6rem; width: 100%; }
  .primary:disabled { opacity: 0.5; }
  .delete { align-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--danger); cursor: pointer; display: inline-flex; flex: none; justify-content: center; margin-right: 0.3rem; min-height: 44px; min-width: 44px; }
  .delete:hover { background: var(--accent-tint); }
  .delete:disabled { cursor: not-allowed; opacity: 0.5; }
  .error { color: var(--danger); }
  ul { border-bottom: 1px solid var(--border); list-style: none; padding: 0.5rem 0 1rem; }
  li { padding: 0.25rem 0; }
  @media (max-width: 899px) {
    .history { grid-template-columns: 1fr; }
    .card { border-bottom: 1px solid var(--border); border-right: 0; }
    .mobile-hidden { display: none; }
    .card > .level-back { background: transparent; border: 0; color: var(--accent); cursor: pointer; display: block; margin-bottom: 1rem; padding: 0.5rem; min-height: 44px; }
  }
</style>
