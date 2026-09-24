<script lang="ts">
  let { note, focusable = true }: { note: string; focusable?: boolean } = $props();
</script>

{#if note}
  {#if focusable}
    <button type="button" class="note" aria-label="Show full note: {note}">
      <span class="preview">{note}</span>
      <span class="full" role="tooltip">{note}</span>
    </button>
  {:else}
    <span class="note">
      <span class="preview">{note}</span>
      <span class="full" role="tooltip">{note}</span>
    </span>
  {/if}
{/if}

<style>
  .note { background: transparent; border: 0; color: inherit; cursor: help; display: block; font: inherit; min-width: 0; padding: 0; position: relative; text-align: left; width: 100%; }
  .preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .full { background: #18202b; border-radius: 6px; color: #fff; display: none; font-size: 0.8rem; font-weight: 500; left: 0; max-height: 45vh; max-width: min(30rem, 80vw); overflow: auto; padding: 0.7rem; position: absolute; top: 100%; white-space: pre-wrap; overflow-wrap: anywhere; width: max-content; z-index: 30; }
  .note:hover .full, .note:focus .full, :global(button:focus-visible) .note .full { display: block; }
</style>
