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

  async function downloadImage(entry: HistoryEntry, aligned: boolean) {
    if (busy) return;
    downloading = true;
    error = '';
    downloadStatus = aligned ? `Preparing aligned image: ${entry.source.name}…` : '';
    try {
      // Paint the status before restoring the saved alignment.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const { downloadSourceImage } = await import('../lib/alignedExport');
      await downloadSourceImage(entry, aligned);
      downloadStatus = `Download started: ${aligned ? 'aligned' : 'original'} source ${entry.source.name}.`;
    } catch (cause) {
      downloadStatus = '';
      error = `Could not download ${entry.source.name}: ${(cause as Error).message}`;
    } finally { downloading = false; }
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

{#if error}<p class="banner error" role="alert">{error}</p>{/if}
{#if downloadStatus}<p class="banner download-status" role="status">{downloadStatus}</p>{/if}
<section class="history" aria-label="History">
  {#if !entries.length}<div class="empty"><span class="empty-icon"><Icon name="folder" size={28} /></span><h2>No saved comparisons yet</h2><p>Align a reference and your drawing, then use Save to keep it here with parts and notes.</p><button class="btn primary" onclick={onstart}>Start a comparison</button></div>{:else}
  <aside class="card" class:mobile-hidden={level !== 'projects'}>
    <h2>Projects</h2>
    {#each projects as item}
      {@const count = entries.filter((entry) => entry.projectName === item.name && entry.reference.name === item.reference).length}
      <button class:active={activeProject?.key === item.key} disabled={downloading} onclick={() => { project = item.key; selectedId = ''; level = 'entries'; downloadStatus = ''; error = ''; }}>
        <span class="project-icon"><Icon name="folder" size={16} /></span><span class="project-text"><strong>{item.name}</strong><small>{count} {count === 1 ? 'comparison' : 'comparisons'} · {item.reference}</small></span>
      </button>
    {/each}
  </aside>
  <div class="card entries" class:mobile-hidden={level !== 'entries'}>
    <button class="level-back" onclick={() => level = 'projects'}><Icon name="back" size={16} />Projects</button>
    <div class="entries-heading">
      <h2>Comparisons</h2>
      <button class="download-sources" onclick={downloadSources} disabled={busy}
        aria-label={`Download aligned sources for ${activeProject?.name}`} title="Download aligned sources — newest capture first, up to 99 PNGs in a ZIP">
        <Icon name="export" />
      </button>
    </div>
    <button class="new-entry" onclick={() => open(projectEntries[0], true)} disabled={busy}
      aria-label={`New comparison in ${activeProject?.name} using existing reference`} title="New comparison using existing reference">
      <Icon name="plus" /><span aria-hidden="true">New comparison with this reference</span>
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
          <div class="entry-downloads">
            <button onclick={() => downloadImage(entry, false)} disabled={busy} aria-label={`Download source image ${entry.source.name}`} title={`Download original: ${entry.source.name}`}><Icon name="export" size={16} />Source</button>
            <button onclick={() => downloadImage(entry, true)} disabled={busy} aria-label={`Download aligned image ${entry.source.name}`} title={`Download aligned PNG: ${entry.source.name}`}><Icon name="export" size={16} />Aligned</button>
          </div>
        </div>
        <button class="delete" onclick={() => remove(entry)} disabled={busy} aria-label={`Delete entry from ${new Date(entry.createdAt).toLocaleString()}`} title="Delete entry">
          <Icon name="trash" />
        </button>
      </div>
    {/each}
  </div>
  {#if selected}
    {#key selected.id}
    <div class="card reopen" class:mobile-hidden={level !== 'detail'}>
      <button class="level-back" onclick={() => level = 'entries'}><Icon name="back" size={16} />Comparisons</button>
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
      <div class="open-row">
        <p>Both images are saved. Reopen without realigning.</p>
        <button class="btn primary" onclick={() => open()} disabled={busy}>{opening ? 'Opening…' : 'Open comparison'}</button>
      </div>
    </div>
    {/key}
  {/if}
  {/if}
</section>

<style>
  .banner { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius); font-size: 0.85rem; margin-bottom: 12px; overflow-wrap: anywhere; padding: 10px 14px; }
  .banner.error { border-color: var(--danger); color: var(--danger); }
  .history { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow); display: grid; grid-template-columns: minmax(200px, 0.8fr) minmax(270px, 1.1fr) minmax(300px, 1.6fr); min-height: 600px; overflow: hidden; }
  .card { background: var(--surface); border-right: 1px solid var(--hairline); min-width: 0; padding: 18px; }
  .card:last-child { border-right: 0; }
  aside.card { background: var(--surface-2); }
  h2 { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.06em; color: var(--ink-muted); margin: 0 0 12px; text-transform: uppercase; }
  .reopen h2 { color: var(--ink); font-size: 1.15rem; letter-spacing: -0.01em; margin-bottom: 4px; text-transform: none; }
  h3 { font-size: 0.85rem; font-weight: 600; margin: 18px 0 6px; }
  p, small { color: var(--ink-muted); font-size: 0.82rem; line-height: 1.5; }
  .card > button:not(.btn, .level-back, .image-open, .new-entry) { align-items: center; background: transparent; border: 0; border-radius: 10px; color: var(--ink); cursor: pointer; display: flex; gap: 10px; margin: 2px 0; min-height: 52px; padding: 8px 10px; text-align: left; width: 100%; }
  .card > button:not(.btn, .level-back, .image-open, .new-entry):hover { background: var(--surface); }
  .card > button.active { background: var(--surface); box-shadow: inset 3px 0 var(--accent), var(--shadow-sm); }
  .project-icon { align-items: center; background: var(--accent-tint); border-radius: 8px; color: var(--accent); display: flex; flex: none; height: 32px; justify-content: center; width: 32px; }
  .project-text { min-width: 0; }
  .card button strong { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .entries-heading { align-items: center; display: flex; justify-content: space-between; margin-bottom: 8px; }
  .entries-heading h2 { margin: 0; }
  .download-sources { align-items: center; background: transparent; border: 1px solid var(--hairline); border-radius: 10px; color: var(--accent); cursor: pointer; display: flex; justify-content: center; min-height: 40px; min-width: 40px; }
  .download-sources:hover { background: var(--accent-tint); }
  .download-sources:disabled, .card > button:disabled { cursor: not-allowed; opacity: 0.5; }
  .new-entry { align-items: center; background: transparent; border: 1.5px dashed var(--dash); border-radius: var(--radius); color: var(--accent); cursor: pointer; display: flex; font-size: 0.85rem; font-weight: 500; gap: 8px; justify-content: center; margin: 0 0 10px; min-height: 52px; width: 100%; }
  .new-entry:hover { background: var(--accent-tint); border-color: var(--accent); }
  .new-entry:disabled { cursor: not-allowed; opacity: 0.5; }
  .entry-row { align-items: center; border: 1px solid transparent; border-radius: var(--radius); display: flex; margin: 4px 0; min-width: 0; transition: background 160ms var(--ease); }
  .entry-row:hover { background: var(--surface-2); }
  .entry-row.active { background: var(--accent-tint); border-color: transparent; box-shadow: inset 3px 0 var(--accent); }
  .entry-content { flex: 1; min-width: 0; }
  .thumbnails { display: flex; gap: 6px; margin: 0; }
  .thumbnails img { background: var(--canvas-bg); border: 1px solid var(--hairline); border-radius: 8px; height: 64px; object-fit: contain; width: calc(50% - 3px); }
  .large img { height: 150px; }
  .image-open.entry-preview { box-sizing: border-box; padding: 10px 10px 0; }
  .entry-select { background: transparent; border: 0; box-sizing: border-box; color: var(--ink); cursor: pointer; min-width: 0; padding: 8px 10px 10px; text-align: left; width: 100%; }
  .entry-select strong { font-weight: 600; }
  .entry-select:disabled { cursor: not-allowed; }
  .entry-select :global(.note) { color: var(--ink-muted); font-size: 0.78rem; margin-top: 2px; }
  .entry-downloads { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 10px; }
  .entry-downloads button { align-items: center; background: transparent; border: 1px solid var(--hairline); border-radius: 8px; color: var(--accent); cursor: pointer; display: inline-flex; font-size: 0.78rem; gap: 6px; min-height: 40px; padding: 6px 10px; }
  .entry-downloads button:hover { background: var(--surface); }
  .entry-downloads button:disabled { cursor: not-allowed; opacity: 0.5; }
  .image-open, .part-open { background: transparent; border: 0; color: var(--ink); cursor: pointer; padding: 0; text-align: left; width: 100%; }
  .reopen .image-open { margin: 14px 0 4px; }
  .reopen :global(.note) { color: var(--ink-muted); font-size: 0.85rem; margin-top: 4px; }
  .part-open { align-items: center; border-radius: 10px; display: flex; gap: 12px; padding: 6px; }
  .part-open span { min-width: 0; overflow-wrap: anywhere; }
  .part-open:hover { background: var(--accent-tint); }
  .part-thumbnail { background: var(--canvas-bg); border: 1px solid var(--hairline); border-radius: 8px; height: 48px; object-fit: contain; width: 64px; }
  .image-open:disabled, .part-open:disabled { cursor: not-allowed; opacity: 0.5; }
  .delete { align-items: center; background: transparent; border: 0; border-radius: 10px; color: var(--danger); cursor: pointer; display: inline-flex; flex: none; justify-content: center; margin-right: 4px; min-height: 40px; min-width: 40px; opacity: 0.7; }
  .delete:hover { background: var(--danger-tint); opacity: 1; }
  .delete:disabled { cursor: not-allowed; opacity: 0.4; }
  ul { list-style: none; padding: 4px 0 0; }
  li { padding: 2px 0; }
  .open-row { align-items: center; border-top: 1px solid var(--hairline); display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; margin-top: 16px; padding-top: 16px; }
  .empty { align-items: center; display: flex; flex-direction: column; gap: 8px; grid-column: 1 / -1; justify-content: center; padding: 5rem 1.5rem; text-align: center; }
  .empty h2 { color: var(--ink); font-size: 1.2rem; letter-spacing: -0.01em; margin: 8px 0 0; text-transform: none; }
  .empty p { max-width: 42ch; margin-bottom: 12px; }
  .empty-icon { align-items: center; background: var(--accent-tint); border-radius: 50%; color: var(--accent); display: flex; height: 64px; justify-content: center; width: 64px; }
  .card > .level-back { display: none; }
  @media (max-width: 899px) {
    .history { grid-template-columns: 1fr; min-height: 0; }
    .card { border-bottom: 1px solid var(--hairline); border-right: 0; }
    .mobile-hidden { display: none; }
    .card > .level-back { align-items: center; background: transparent; border: 0; color: var(--accent); cursor: pointer; display: inline-flex; font-weight: 500; gap: 6px; margin: -6px 0 10px -6px; min-height: 40px; padding: 0 6px; }
  }
</style>
