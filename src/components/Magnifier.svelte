<script module lang="ts">
  export const magnifierPreferenceContext = Symbol('magnifier-preference');
</script>

<script lang="ts">
  import { getContext } from 'svelte';
  import type { Point } from '../lib/manualAnchors';
  import { crosshairShades, type Sampler } from '../lib/contrast';
  import Crosshair from './Crosshair.svelte';

  let { image, point, surface, sampler }: {
    image: HTMLImageElement;
    point: Point;
    surface: HTMLDivElement | SVGSVGElement;
    sampler: Sampler | null;
  } = $props();

  const preference = getContext<{ enabled: boolean } | undefined>(magnifierPreferenceContext);
  let enabled = $derived(preference?.enabled ?? true);
  const size = 112;
  const zoom = 3;
  let layoutVersion = $state(0);

  $effect(() => {
    if (!enabled) return;
    const observer = new ResizeObserver(() => layoutVersion++);
    observer.observe(surface);
    const update = () => layoutVersion++;
    // Capture scrolls from zoomed image containers as well as the page.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  });

  let geometry = $derived.by(() => {
    layoutVersion;
    let screen: Point;
    let imagePerScreen: number;
    if (surface instanceof SVGSVGElement) {
      const matrix = surface.getScreenCTM()!;
      screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      imagePerScreen = 1 / matrix.a;
    } else {
      const rect = surface.getBoundingClientRect();
      imagePerScreen = Math.max(image.naturalWidth / surface.clientWidth, image.naturalHeight / surface.clientHeight);
      screen = {
        x: rect.left + surface.clientLeft + (surface.clientWidth - image.naturalWidth / imagePerScreen) / 2 + point.x / imagePerScreen,
        y: rect.top + surface.clientTop + (surface.clientHeight - image.naturalHeight / imagePerScreen) / 2 + point.y / imagePerScreen
      };
    }
    const margin = 8;
    const gap = 44;
    const maxX = window.innerWidth - size - margin;
    const maxY = window.innerHeight - size - margin;
    const clampX = (x: number) => Math.max(margin, Math.min(maxX, x));
    const clampY = (y: number) => Math.max(margin, Math.min(maxY, y));
    const candidates = [
      { x: clampX(screen.x - size / 2), y: screen.y - size - gap },
      { x: screen.x + gap, y: clampY(screen.y - size / 2) },
      { x: screen.x - size - gap, y: clampY(screen.y - size / 2) },
      { x: clampX(screen.x - size / 2), y: screen.y + gap }
    ];
    const position = candidates.find((p) => p.x >= margin && p.x <= maxX && p.y >= margin && p.y <= maxY)
      ?? { x: clampX(screen.x - size / 2), y: clampY(screen.y - size - gap) };
    return { ...position, span: size * imagePerScreen / zoom, imagePerScreen: imagePerScreen / zoom };
  });
  let shades = $derived(crosshairShades(sampler, point, geometry.imagePerScreen));
</script>

{#if enabled}
  <div class="magnifier" aria-hidden="true" style:left="{geometry.x}px" style:top="{geometry.y}px">
    <svg class="detail" viewBox="{point.x - geometry.span / 2} {point.y - geometry.span / 2} {geometry.span} {geometry.span}">
      <image href={image.src} width={image.naturalWidth} height={image.naturalHeight} />
    </svg>
    <svg class="reticle" viewBox="0 0 112 112"><g transform="translate(56 56)"><Crosshair {shades} /></g></svg>
    <span class="zoom">3×</span>
  </div>
{/if}

<style>
  .magnifier { background: white; border: 2px solid var(--accent); border-radius: 50%; box-shadow: 0 0 0 2px white, 0 4px 18px rgb(0 0 0 / 25%); box-sizing: content-box; height: 112px; overflow: hidden; pointer-events: none; position: fixed; width: 112px; z-index: 100; }
  svg { display: block; height: 100%; width: 100%; }
  .reticle { inset: 0; position: absolute; }
  .zoom { background: var(--surface); border-radius: 8px; bottom: 7px; color: var(--ink); font-size: 0.65rem; font-weight: 600; left: 50%; line-height: 1.4; padding: 0 5px; position: absolute; transform: translateX(-50%); }
</style>
