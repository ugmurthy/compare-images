<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

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

<div class="theme-tool" title={`Color theme: ${theme}`}>
  <Icon name="theme" />
  <select aria-label="Color theme" bind:value={theme}>
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
</div>

<style>
  .theme-tool { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
  select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .theme-tool:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
