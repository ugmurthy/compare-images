<script lang="ts">
  import { onMount, tick } from 'svelte';

  let text = $state('');
  let left = $state(0);
  let top = $state(0);
  let panel: HTMLDivElement = $state()!;

  onMount(() => {
    let active: HTMLElement | null = null;
    let previousDescription: string | null = null;

    function hide() {
      if (active) {
        if (previousDescription === null) active.removeAttribute('aria-describedby');
        else active.setAttribute('aria-describedby', previousDescription);
      }
      active = null;
      text = '';
    }

    async function show(event: Event) {
      const target = (event.target as Element).closest<HTMLElement>('[data-tooltip]');
      if (target === active) return;
      hide();
      if (!target || !target.dataset.tooltip) return;
      // Restored or programmatic focus after a pointer action should not pop a tooltip.
      if (event.type === 'focusin' && !target.matches(':focus-visible')) return;
      active = target;
      previousDescription = target.getAttribute('aria-describedby');
      target.setAttribute('aria-describedby', [previousDescription, 'app-tooltip'].filter(Boolean).join(' '));
      text = target.dataset.tooltip;
      await tick();
      if (active !== target) return;
      const rect = target.getBoundingClientRect();
      left = Math.max(16, Math.min(rect.left + rect.width / 2 - panel.offsetWidth / 2, window.innerWidth - panel.offsetWidth - 16));
      top = rect.bottom + 8;
      if (top + panel.offsetHeight > window.innerHeight - 16) top = Math.max(16, rect.top - panel.offsetHeight - 8);
    }

    // Convert native titles, including dynamically rendered controls, to the shared tooltip.
    function convert(element: Element) {
      if (element.hasAttribute('title')) {
        element.setAttribute('data-tooltip', element.getAttribute('title') ?? '');
        element.removeAttribute('title');
      }
      element.querySelectorAll('[title]').forEach(convert);
    }
    convert(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') convert(record.target as Element);
        else record.addedNodes.forEach((node) => { if (node instanceof Element) convert(node); });
      }
      if (active && !active.isConnected) hide();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    function leave(event: PointerEvent) {
      if (active && !active.contains(event.relatedTarget as Node | null)) hide();
    }
    function blur() {
      const blurred = active;
      // DOM removal can dispatch focusout during a Svelte render.
      queueMicrotask(() => { if (active === blurred) hide(); });
    }
    function keydown(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', keydown);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      observer.disconnect();
      document.removeEventListener('pointerover', show);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  });
</script>

{#if text}
  <div bind:this={panel} id="app-tooltip" class="tip" role="tooltip" style:left="{left}px" style:top="{top}px">{text}</div>
{/if}

<style>
  .tip { background: var(--tooltip-bg); border-radius: 8px; box-shadow: var(--shadow); box-sizing: border-box; color: var(--tooltip-ink); font-size: 0.78rem; font-weight: 500; line-height: 1.4; max-height: calc(100vh - 32px); max-width: min(320px, calc(100vw - 32px)); overflow: auto; overflow-wrap: anywhere; padding: 6px 10px; pointer-events: none; position: fixed; text-align: left; white-space: pre-wrap; width: max-content; z-index: 100; }
</style>
