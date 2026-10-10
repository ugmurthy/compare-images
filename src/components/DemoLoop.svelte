<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let { name, label, width, height }: { name: string; label: string; width: number; height: number } = $props();
  let video: HTMLVideoElement;
  let playing = $state(false);
  let failed = $state(false);
  let pausedByUser = false;

  onMount(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;

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
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      video.pause();
    };
  });

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

<figure class="demo-player">
  <video bind:this={video} src={`/demos/${name}.mp4`} poster={`/demos/${name}.jpg`}
    {width} {height} muted loop playsinline preload="none" aria-label={label}
    onplay={() => playing = true} onpause={() => playing = false} onerror={() => failed = true}>
    <track kind="captions" />
  </video>
  <figcaption>
    <span>{failed ? 'Preview unavailable' : 'Recorded in Compare Sketch'}</span>
    <button class="btn quiet" onclick={toggle} disabled={failed} aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}>
      <Icon name={playing ? 'stop' : 'play'} size={14} />{playing ? 'Pause' : 'Play'}
    </button>
  </figcaption>
</figure>

<style>
  .demo-player { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
  video { background: #111318; display: block; height: auto; width: 100%; }
  figcaption { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.72rem; justify-content: space-between; min-height: 44px; padding: 0 12px 0 16px; }
  figcaption .btn { font-size: 0.75rem; min-height: 36px; padding: 0 8px; }
</style>
