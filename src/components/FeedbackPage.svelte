<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { supabase } from '../lib/supabase';

  let { onBack }: { onBack: () => void } = $props();
  const kinds: Record<string, string> = { feedback: 'Feedback', suggestion: 'Suggestion', bug: 'Bug report', feature: 'Feature request' };
  let kind = $state('feedback');
  let message = $state('');
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let historyError = $state('');
  let heading: HTMLHeadingElement;
  let reports = $state<{ id: string; kind: string; message: string; status: string; created_at: string }[]>([]);

  async function loadReports() {
    historyError = '';
    if (!supabase) return;
    const { data, error } = await supabase.from('sketch_feedback').select('id, kind, message, status, created_at')
      .order('created_at', { ascending: false }).limit(10);
    if (error) historyError = 'Could not load your previous submissions. You can retry below.';
    else reports = data ?? [];
  }
  onMount(() => { heading.focus({ preventScroll: true }); void loadReports(); });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    error = '';
    notice = '';
    if (message.trim().length < 10) { error = 'Please include at least 10 characters of detail.'; return; }
    busy = true;
    try {
      const { data, error: saveError } = await supabase.rpc('sketch_submit_feedback', { p_kind: kind, p_message: message.trim() });
      if (saveError || !data) throw new Error('Save unavailable');
      notice = 'Thank you—your submission has been saved. You can find it below, even after leaving this page.';
      message = '';
      await loadReports();
    } catch {
      error = 'Could not confirm that your feedback was saved. Your text is still here. Check your recent submissions before retrying; if you’ve sent several, try again in an hour.';
      void loadReports();
    } finally { busy = false; }
  }
</script>

<div class="feedback-page">
  <header><a class="brand" href="/welcome" aria-label="SketchLens home"><Icon name="logo" size={24} />SketchLens</a><button class="btn quiet" disabled={busy} onclick={onBack}><Icon name="back" size={16} />Back to app</button></header>
  <main>
    <p class="eyebrow">Help shape SketchLens</p>
    <h1 bind:this={heading} tabindex="-1">Your perspective matters.</h1>
    <p>Share feedback, suggest an improvement, report a bug, or request a feature.</p>
    <form onsubmit={submit} aria-label="Submit feedback">
      <label for="feedback-kind">What would you like to share?</label>
      <select id="feedback-kind" bind:value={kind} disabled={busy}>{#each Object.entries(kinds) as [value, label]}<option {value}>{label}</option>{/each}</select>
      <label for="feedback-message">{kind === 'bug' ? 'What happened, and what did you expect?' : 'Tell us more'}</label>
      <textarea id="feedback-message" bind:value={message} required minlength="10" maxlength="4000" rows="7" disabled={busy} aria-describedby="feedback-hint" placeholder={kind === 'bug' ? 'Steps to reproduce, expected result, and what happened instead…' : 'What could make your next sketch study better?'}></textarea>
      <div class="field-note"><small id="feedback-hint">10–4,000 characters. Don’t include passwords, payment details, or private images.</small><small>{message.length}/4,000</small></div>
      <p class="privacy">Submissions are stored securely with your account for the SketchLens team to review. They are not public. No sketch or browser history is attached.</p>
      <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Send feedback'}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    </form>
    <section aria-labelledby="recent-title"><h2 id="recent-title">Your recent submissions</h2><p class="hint">Your latest 10 reports, saved across devices.</p>
      {#if historyError}<p class="error" role="alert">{historyError}</p><button class="btn" onclick={() => void loadReports()}>Retry submissions</button>
      {:else if !reports.length}<p class="hint">No submissions yet.</p>{/if}
      {#each reports as report (report.id)}<article><div class="report-heading"><strong>{kinds[report.kind]}</strong><span class="chip">{report.status}</span><time datetime={report.created_at}>{new Date(report.created_at).toLocaleDateString()}</time></div><p class="report-message">{report.message}</p></article>{/each}
    </section>
  </main>
</div>

<style>
  .feedback-page { min-height: 100dvh; }
  header { align-items: center; border-bottom: 1px solid var(--hairline); display: flex; gap: 16px; justify-content: space-between; padding: 18px 32px; }
  .brand { align-items: center; color: var(--accent); display: flex; font-weight: 600; gap: 10px; text-decoration: none; }
  main { margin: auto; max-width: 760px; padding: 48px 24px; }
  .eyebrow { color: var(--accent); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
  h1 { font-size: clamp(1.8rem, 5vw, 2.5rem); letter-spacing: -0.04em; margin: 14px 0; }
  h2 { font-size: 1.2rem; }
  p, small { color: var(--ink-muted); }
  form { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); display: grid; gap: 12px; margin: 28px 0 40px; padding: 28px; }
  label { font-size: 0.85rem; font-weight: 500; }
  select, textarea { background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); min-width: 0; padding: 12px; width: 100%; }
  textarea { resize: vertical; }
  .field-note { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
  small, .privacy { font-size: 0.75rem; }
  form .btn { justify-self: start; margin-top: 4px; }
  .error { color: var(--danger); }
  .notice { background: var(--ok-tint); border-radius: var(--radius-sm); color: var(--ok); padding: 12px; }
  article { border-top: 1px solid var(--hairline); margin-top: 16px; padding-top: 16px; }
  .report-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; }
  time { color: var(--ink-muted); font-size: 0.75rem; margin-left: auto; }
  .report-message { margin-top: 10px; overflow-wrap: anywhere; white-space: pre-wrap; }
  @media (max-width: 719px) { header { padding: 16px; } main { padding: 32px 16px; } form { padding: 20px; } }
</style>
