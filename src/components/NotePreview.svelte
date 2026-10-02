<script lang="ts">
  let { note, focusable = true }: { note: string; focusable?: boolean } = $props();
</script>

{#if note}
  {#if focusable}
    <button type="button" class="note" aria-label="Show full note: {note}" title={note}>
      <span class="preview">{note}</span>
    </button>
  {:else}
    <span class="note" title={note}>
      <span class="preview">{note}</span>
    </span>
  {/if}
{/if}

<style>
  .note { background: transparent; border: 0; color: inherit; cursor: help; display: block; font: inherit; min-width: 0; padding: 0; position: relative; text-align: left; width: 100%; }
  .preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
