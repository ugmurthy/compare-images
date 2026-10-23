<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let { name, label, width, height, caption = 'Recorded in SketchLens' }: { name: string; label: string; width: number; height: number; caption?: string } = $props();
  let figure: HTMLElement;
  let video: HTMLVideoElement;
  let playing = $state(false);
  let failed = $state(false);
  let expanded = $state(false);
  let canExpand = $state(false);
  let expandError = $state('');
  let pausedByUser = false;

  onMount(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    canExpand = document.fullscreenEnabled;

    function fullscreenChanged() { expanded = document.fullscreenElement === figure; }

    function update() {
      if (visible && !motion.matches && !pausedByUser && !document.hidden) {
        void video.play().catch(() => { /* The play button remains available if autoplay is blocked. */ });
      } else video.pause();
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }, { threshold: 0.15 });
    observer.observe(video);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    document.addEventListener('fullscreenchange', fullscreenChanged);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      video.pause();
    };
  });

  async function toggleFullscreen() {
    expandError = '';
    try {
      if (document.fullscreenElement === figure) await document.exitFullscreen();
      else await figure.requestFullscreen();
    } catch { expandError = 'Could not expand this preview.'; }
  }

  function toggle() {
    if (video.paused) {
      pausedByUser = false;
      void video.play().catch(() => { failed = true; });
    } else {
      pausedByUser = true;
      video.pause();
    }
  }
</script>

<figure bind:this={figure} class="demo-player">
  <video bind:this={video} src={`/demos/${name}.mp4`} poster={`/demos/${name}.jpg`}
    {width} {height} muted loop playsinline preload="none" aria-label={label}
    onplay={() => playing = true} onpause={() => playing = false} onerror={() => failed = true}>
    <track kind="captions" />
  </video>
  {#if expandError}<p class="expand-error" role="status">{expandError}</p>{/if}
  <figcaption>
    <span>{failed ? 'Preview unavailable' : caption}</span>
    <div class="player-actions">
      <button class="btn quiet" onclick={toggle} disabled={failed} aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}>
        <Icon name={playing ? 'stop' : 'play'} size={14} />{playing ? 'Pause' : 'Play'}
      </button>
      {#if canExpand}<button class="btn quiet expand" onclick={toggleFullscreen} aria-label={`${expanded ? 'Close' : 'Expand'} ${label}`}><Icon name={expanded ? 'close' : 'parts'} size={15} /></button>{/if}
    </div>
  </figcaption>
</figure>

<style>
  .demo-player { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
  video { background: #111318; display: block; height: auto; width: 100%; }
  figcaption { align-items: center; color: var(--ink-muted); display: flex; flex-wrap: wrap; font-size: 0.68rem; gap: 4px; justify-content: space-between; min-height: 44px; padding: 0 8px 0 12px; text-align: left; }
  .player-actions { align-items: center; display: flex; margin-left: auto; }
  figcaption .btn { font-size: 0.72rem; min-height: 40px; padding: 0 6px; }
  figcaption .expand { width: 36px; }
  .expand-error { color: var(--ink-muted); font-size: 0.72rem; padding: 8px 12px; }
  .demo-player:fullscreen { border: 0; border-radius: 0; display: flex; flex-direction: column; justify-content: center; padding: 24px; }
  .demo-player:fullscreen video { aspect-ratio: auto; height: calc(100dvh - 96px); object-fit: contain; }
  .demo-player:fullscreen figcaption { flex: none; }
</style>
