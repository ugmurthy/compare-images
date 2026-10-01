<script lang="ts">
  import { onMount } from 'svelte';

  let theme = $state('system');
  try {
    const saved = localStorage.getItem('compare-sketch-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* Theme still works when browser storage is unavailable. */ }

  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });

  $effect(() => {
    document.documentElement.dataset.theme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    try { localStorage.setItem('compare-sketch-theme', theme); }
    catch { /* Keep the selected theme for this session. */ }
  });
</script>

<select aria-label="Color theme" title="Color theme" bind:value={theme}>
  <option value="system">◐ System</option>
  <option value="light">☀ Light</option>
  <option value="dark">☾ Dark</option>
</select>

<style>
  select { font-size: 0.8rem; max-width: 110px; }
</style>
