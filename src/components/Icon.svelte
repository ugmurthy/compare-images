<script lang="ts">
  let { name }: { name: string } = $props();
  const paths: Record<string, string> = {
    back: 'm12 5-7 7 7 7M5 12h15',
    previous: 'm15 5-7 7 7 7',
    next: 'm9 5 7 7-7 7',
    grid: 'M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    undo: 'm8 3-5 5 5 5M3 8h11a7 7 0 0 1 0 14',
    clear: 'm9 5-7 7 7 7h12V5H9Zm3 4 6 6m0-6-6 6',
    check: 'm4 12 5 5L20 6',
    plus: 'M12 5v14M5 12h14',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h9V3M7 21v-8h10v8',
    rotate: 'M20 7v5h-5M20 12a8 8 0 1 0-2 6',
    auto: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5m9-10 1.5 4.5L18 12l-4.5 1.5L12 18l-1.5-4.5L6 12l4.5-1.5L12 6Z',
    manual: 'M12 2v5M12 17v5M2 12h5M17 12h5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 11v2',
    history: 'M3 3v6h6M3 9a9 9 0 1 1 0 6M12 7v5l3 2',
    export: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6',
    import: 'M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6',
    'replace-reference': 'M11 3H3v18h18V11M3 17l5-5 5 5 3-3 5 5M22 6H13m4-4-4 4 4 4',
    'replace-source': 'M11 3H3v18h18V11M3 17l5-5 5 5 3-3 5 5M13 6h9m-4-4 4 4-4 4',
    new: 'M14 3H4v18h16V11M18 2v8M14 6h8M8 9h3M8 13h6M8 17h6',
    parts: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z',
    play: 'm8 5 11 7-11 7Z',
    stop: 'M6 6h12v12H6Z',
    theme: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 3v18'
  };
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  {#if name === 'side-by-side'}
    <rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" />
  {:else if name === 'stacked'}
    <rect x="4" y="3" width="16" height="7" rx="1.5" /><rect x="4" y="14" width="16" height="7" rx="1.5" />
  {:else if name === 'overlay'}
    <rect x="3" y="3" width="12" height="12" rx="2" /><rect x="9" y="9" width="12" height="12" rx="2" />
  {:else}
    <path d={paths[name]} />
  {/if}
</svg>

<style>
  svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
</style>
