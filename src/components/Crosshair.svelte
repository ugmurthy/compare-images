<svelte:options namespace="svg" />

<script lang="ts">
  import { CROSSHAIR, DEFAULT_SHADES, type CrosshairShades } from '../lib/contrast';

  // Drawn in screen pixels around (0, 0); callers translate to the exact click point and undo zoom.
  let { shades = DEFAULT_SHADES, emphasis = false }: { shades?: CrosshairShades; emphasis?: boolean } = $props();
  const { gap, arm, ring } = CROSSHAIR;
</script>

<g class="marker" class:emphasis aria-hidden="true">
  <path class="arm" data-arm="left" d="M {-arm} 0 H {-gap}" style:stroke={shades.left} />
  <path class="arm" data-arm="right" d="M {gap} 0 H {arm}" style:stroke={shades.right} />
  <path class="arm" data-arm="up" d="M 0 {-arm} V {-gap}" style:stroke={shades.up} />
  <path class="arm" data-arm="down" d="M 0 {gap} V {arm}" style:stroke={shades.down} />
  <circle class="ring" r={ring} style:stroke={shades.ring} />
</g>

<style>
  .marker { pointer-events: none; }
  .arm, .ring { fill: none; stroke-width: 1.25; stroke-linecap: butt; vector-effect: non-scaling-stroke; }
  .emphasis .arm, .emphasis .ring { stroke-width: 2; }
</style>
