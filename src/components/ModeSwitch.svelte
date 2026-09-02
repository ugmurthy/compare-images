<script lang="ts">
  export type ComparisonMode = 'visual' | 'manual' | 'auto';

  let {
    value,
    onchange
  }: {
    value: ComparisonMode;
    onchange: (mode: ComparisonMode) => void;
  } = $props();

  const modes: Array<{
    id: ComparisonMode;
    label: string;
    tooltip: string;
    icon: 'columns' | 'crosshair' | 'scan';
  }> = [
    {
      id: 'visual',
      label: 'Visual',
      tooltip: 'Compare originals — View reference and source side by side without alignment.',
      icon: 'columns'
    },
    {
      id: 'manual',
      label: 'Manual anchors',
      tooltip: 'Align with anchor points — Mark matching locations, then compare the manually aligned result.',
      icon: 'crosshair'
    },
    {
      id: 'auto',
      label: 'Auto align',
      tooltip: 'Align automatically — Detect matching features and align the source to the reference.',
      icon: 'scan'
    }
  ];

  function handleKeydown(event: KeyboardEvent, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + modes.length) % modes.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % modes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = modes.length - 1;
    onchange(modes[nextIndex].id);
    document.getElementById(`comparison-mode-${modes[nextIndex].id}`)?.focus();
  }
</script>

<div class="mode-switch" role="tablist" aria-label="Comparison method">
  {#each modes as mode, index}
    <span class="mode-item">
      <button
        id="comparison-mode-{mode.id}"
        class:active={value === mode.id}
        role="tab"
        aria-selected={value === mode.id}
        aria-controls="comparison-workspace"
        tabindex={value === mode.id ? 0 : -1}
        onclick={() => onchange(mode.id)}
        onkeydown={(event) => handleKeydown(event, index)}
        aria-describedby="mode-tooltip-{mode.id}"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {#if mode.icon === 'columns'}
            <rect x="3.5" y="5" width="7" height="14" rx="1.5"></rect>
            <rect x="13.5" y="5" width="7" height="14" rx="1.5"></rect>
          {:else if mode.icon === 'crosshair'}
            <circle cx="12" cy="12" r="5"></circle>
            <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"></path>
            <circle cx="12" cy="12" r="1"></circle>
          {:else}
            <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"></path>
            <path d="m12 7 .75 2.25L15 10l-2.25.75L12 13l-.75-2.25L9 10l2.25-.75L12 7Z"></path>
          {/if}
        </svg>
        <span>{mode.label}</span>
      </button>
      <span class="tooltip" id="mode-tooltip-{mode.id}" role="tooltip">{mode.tooltip}</span>
    </span>
  {/each}
</div>

<style>
  .mode-switch {
    background: var(--control-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 0.22rem;
  }

  .mode-item {
    min-width: 0;
    position: relative;
  }

  button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.5rem;
    justify-content: center;
    min-height: 2.5rem;
    padding: 0.45rem 0.75rem;
    width: 100%;
  }

  button:hover {
    color: var(--text);
  }

  button.active {
    background: #fff;
    box-shadow: 0 1px 5px rgba(20, 26, 35, 0.13);
    color: var(--text);
  }

  svg {
    fill: none;
    flex: 0 0 auto;
    height: 1.15rem;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
    width: 1.15rem;
  }

  .tooltip {
    background: #18202b;
    border-radius: 6px;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 600;
    left: 50%;
    line-height: 1.4;
    max-width: 270px;
    opacity: 0;
    padding: 0.5rem 0.65rem;
    pointer-events: none;
    position: absolute;
    top: calc(100% + 0.5rem);
    transform: translate(-50%, -4px);
    transition: opacity 0.12s, transform 0.12s;
    visibility: hidden;
    width: max-content;
    z-index: 20;
  }

  .mode-item:hover .tooltip,
  button:focus-visible + .tooltip {
    opacity: 1;
    transform: translate(-50%, 0);
    transition-delay: 350ms;
    visibility: visible;
  }

  @media (max-width: 620px) {
    button {
      gap: 0.35rem;
      padding-inline: 0.35rem;
    }

    button span {
      font-size: 0.72rem;
    }

    .tooltip {
      display: none;
    }
  }
</style>
