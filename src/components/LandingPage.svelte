<script lang="ts">
  import Icon from './Icon.svelte';
  import DemoLoop from './DemoLoop.svelte';
  let { signedIn = false }: { signedIn?: boolean } = $props();
  const features = [
    { id: 'align', name: 'align', title: 'Align', label: 'four-point alignment demo', caption: 'Match it', height: 950,
      benefit: 'Your drawing. Not your camera angle.',
      description: 'Bring your reference and sketch into the same perspective. Match at least four points across both images, with a 3× magnifier to refine placement.' },
    { id: 'compare', name: 'compare', title: 'Compare', label: 'whole-image and selected-part comparison demo', caption: 'Whole & part', height: 858,
      benefit: 'The whole picture. Any detail.',
      description: 'Compare whole images, then select just the part you’re working on. Study matching regions side by side, or animate an overlay to see where lines diverge.' },
    { id: 'measure', name: 'measure', title: 'Measure', label: 'synchronized measurement and panning demo', caption: 'Measure in sync', height: 1056,
      benefit: 'Two images. One connected view.',
      description: 'Measure corresponding points on your reference and aligned sketch together. Zoom to 2× or 4× and pan both images in sync, with live width and height readouts.' },
    { id: 'replay', name: 'progress', title: 'Share', label: 'drawing progress GIF demo', caption: '5 saved stages', height: 640,
      benefit: 'Your drawing, over time.',
      description: 'Share your drawing journey with a GIF made from images at different stages of your project.' }
  ];
</script>

<div class="landing">
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="header-inner">
      <a class="app-wordmark" href="/welcome" aria-label="SketchLens home"><Icon name="logo" size={44} /><span>SketchLens</span></a>
      <div class="account-actions"><nav aria-label="Main navigation"><a href="/pricing">Pricing</a></nav>{#if signedIn}<a class="btn primary" href="/">Open workspace <Icon name="next" size={15} /></a>{:else}<a class="btn quiet" href="/signin">Sign in</a><a class="btn primary" href="/signup">Start free <Icon name="next" size={15} /></a>{/if}</div>
    </div>
  </header>

  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <h1 id="hero-title"><a class="hero-brand" href="/welcome" aria-label="SketchLens home"><Icon name="logo" size={80} /><span>SketchLens</span></a></h1>
        <p class="hero-tagline">Align. Compare. Measure. <span>Share.</span></p>
        <h2 class="hero-benefit">A clearer way to draw.</h2>
        <p class="intro">Bring your reference and sketch into focus. Compare the whole drawing or any detail, measure in sync, and turn your progress into a shareable GIF.</p>
        <div class="hero-actions"><a class="btn primary" href={signedIn ? '/' : '/signup'}>{signedIn ? 'Open your workspace' : 'Start your free trial'} <Icon name="next" size={18} /></a></div>
        <p class="trial-note">3 months. All features. No credit card needed.</p>
      </div>
      <div class="hero-demo">
        <DemoLoop name="hero-sketch" label="reference and sketch hero demo" width={1280} height={960} />
        <p class="demo-note">Your reference. Your drawing. A fresh perspective.</p>
      </div>
    </section>

    <section class="showcase wrap" aria-labelledby="tools-title">
      <div class="section-heading"><p class="eyebrow">See the difference. At every stage.</p><h2 id="tools-title">Four tools. A closer look.</h2></div>
      <div class="feature-grid">
        {#each features as feature, index}
          <article id={feature.id} class="feature-card" aria-labelledby={`${feature.id}-title`}>
            <div class="feature-media" class:progress={feature.id === 'replay'}>
              <DemoLoop name={feature.name} label={feature.label} caption={feature.caption} width={feature.id === 'replay' ? 458 : 1280} height={feature.height} />
              {#if feature.id === 'replay'}<span class="gif-label">GIF</span>{/if}
            </div>
            <div class="feature-copy">
              <h3 id={`${feature.id}-title`}><span class="step-number">{index + 1}</span>{feature.title}</h3>
              <h4>{feature.benefit}</h4>
              <p>{feature.description}</p>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <div class="trust wrap">
      <span><Icon name="image" />Your reference. Your sketch photos.</span>
      <span><Icon name="check" />Image processing stays in your browser.</span>
      <span><Icon name="history" />Your progress, worth looking back on.</span>
    </div>

    <section class="closing wrap" aria-labelledby="closing-title">
      <p class="eyebrow">Your next study starts here</p>
      <h2 id="closing-title">Keep drawing. <span>See what comes next.</span></h2>
      <p>Align, compare, measure, and share. All features, free for 3 months.</p>
      <a class="btn primary" href={signedIn ? '/' : '/signup'}>{signedIn ? 'Return to your workspace' : 'Create your free account'} <Icon name="next" size={18} /></a>
      <p class="trial-note">No credit card needed. <a href="/pricing">Explore plans & pricing <span aria-hidden="true">↗</span></a></p>
    </section>
  </main>

  <footer class="wrap"><a class="wordmark" href="/welcome"><Icon name="logo" size={24} /><span>SketchLens</span></a><p>Built for a closer look.</p><a href="/feedback">Give feedback</a><a href="/pricing">Plans & pricing</a><a href={signedIn ? '/' : '/signin'}>{signedIn ? 'Open workspace' : 'Sign in'}</a></footer>
</div>

<style>
  .landing { min-height: 100dvh; }
  a, .landing :global(button) { scroll-margin-block: 140px 24px; }
  .wrap, .header-inner { margin-inline: auto; max-width: 1240px; width: calc(100% - 96px); }
  header { background: var(--surface-frost); border-bottom: 1px solid var(--hairline); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(14px); }
  .header-inner { align-items: center; display: flex; gap: 24px; justify-content: space-between; min-height: 80px; }
  .wordmark { align-items: center; color: var(--ink); display: inline-flex; font-size: 1.15rem; font-weight: 600; gap: 10px; letter-spacing: -0.04em; text-decoration: none; white-space: nowrap; }
  .wordmark :global(svg) { color: var(--accent); }
  nav { align-items: center; display: flex; margin-right: 16px; }
  nav a, footer > a:not(.wordmark) { color: var(--ink-muted); font-size: 0.82rem; text-decoration: none; }
  nav a:hover, footer > a:hover { color: var(--accent); }
  .account-actions { align-items: center; display: flex; gap: 8px; }
  .hero { padding-block: 48px 36px; text-align: center; }
  h1 { font-size: clamp(2.5rem, 4.8vw, 3.7rem); letter-spacing: -0.06em; line-height: 1.1; }
  .hero-brand { align-items: center; color: var(--ink); display: inline-flex; gap: 14px; text-decoration: none; white-space: nowrap; }
  .hero-brand :global(svg) { color: var(--accent); height: 1.1em; width: 1.1em; }
  .hero-tagline { color: var(--accent); font-size: 1.1rem; font-weight: 500; letter-spacing: -0.035em; margin-top: 12px; }
  .hero-tagline span { color: var(--ink-muted); }
  h2 { font-size: clamp(1.9rem, 3vw, 2.6rem); letter-spacing: -0.05em; line-height: 1.18; }
  .hero-benefit { font-size: clamp(2rem, 3.4vw, 3rem); margin-top: 26px; }
  .intro { color: var(--ink-muted); font-size: 1rem; line-height: 1.8; margin: 16px auto 0; max-width: 710px; }
  .hero-actions { display: flex; justify-content: center; margin-top: 24px; }
  .hero-actions .btn, .closing .btn { min-height: 48px; padding-inline: 20px; }
  .trial-note { align-items: center; color: var(--ink-muted); display: flex; flex-wrap: wrap; font-size: 0.72rem; gap: 12px; justify-content: center; margin-top: 14px; }
  .hero-demo { margin: 32px auto 0; max-width: 880px; }
  .hero-demo :global(video) { aspect-ratio: 16 / 9; object-fit: cover; }
  .demo-note { color: var(--ink-muted); font-size: 0.75rem; line-height: 1.6; margin-top: 14px; }
  .showcase { padding-block: 24px 32px; }
  .section-heading { margin-bottom: 28px; text-align: center; }
  .eyebrow { color: var(--accent); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.13em; margin-bottom: 12px; text-transform: uppercase; }
  .section-heading h2 { font-size: clamp(1.6rem, 2.3vw, 2rem); }
  .feature-grid { display: grid; gap: 20px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .feature-card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); overflow: hidden; scroll-margin-top: 100px; }
  .feature-media { position: relative; }
  .feature-media :global(.demo-player) { border: 0; border-bottom: 1px solid var(--hairline); border-radius: 0; box-shadow: none; }
  .feature-media :global(video) { aspect-ratio: 4 / 3; object-fit: contain; }
  .progress :global(video) { background: var(--canvas-bg); }
  .feature-copy { padding: 20px; }
  h3 { align-items: center; display: flex; font-size: 1.12rem; gap: 10px; letter-spacing: -0.03em; }
  .step-number { align-items: center; background: var(--accent-tint); border-radius: 50%; color: var(--accent); display: inline-flex; flex: none; font-size: 0.85rem; height: 28px; justify-content: center; width: 28px; }
  h4 { font-size: 0.83rem; font-weight: 500; letter-spacing: -0.02em; line-height: 1.6; margin-top: 16px; }
  .feature-copy > p { color: var(--ink-muted); font-size: 0.8rem; line-height: 1.8; margin-top: 8px; }
  .gif-label { background: var(--surface-frost); border: 1px solid var(--border-strong); border-radius: 6px; color: var(--ink); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.06em; padding: 4px 7px; pointer-events: none; position: absolute; right: 10px; top: 10px; }
  .trust { align-items: center; border-block: 1px solid var(--hairline); display: flex; gap: 24px; justify-content: space-between; padding-block: 24px; }
  .trust > span { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.74rem; gap: 10px; }
  .trust :global(svg) { color: var(--accent); }
  .closing { padding-block: 60px 52px; text-align: center; }
  .closing h2 span { color: var(--accent); }
  .closing > p:not(.eyebrow) { color: var(--ink-muted); line-height: 1.7; margin-top: 20px; }
  .closing .btn { margin-top: 24px; }
  .trial-note a { color: var(--accent); }
  footer { align-items: center; border-top: 1px solid var(--hairline); display: flex; flex-wrap: wrap; gap: 24px; padding-block: 28px; }
  footer p { color: var(--ink-muted); font-size: 0.75rem; margin-right: auto; }
  footer .wordmark { font-size: 1rem; }
  .skip-link { background: var(--surface); color: var(--accent); left: 16px; padding: 12px; position: fixed; top: -80px; z-index: 20; }
  .skip-link:focus { top: 12px; }
  a:not(.btn, .hero-brand):hover { text-decoration: underline; }
  @media (max-width: 1100px) {
    .wrap, .header-inner { width: calc(100% - 48px); }
    .header-inner { gap: 20px; }
    .feature-grid { gap: 16px; }
    .feature-copy { padding: 16px; }
  }
  @media (max-width: 1000px) { .feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 850px) {
    .header-inner { flex-wrap: wrap; gap: 8px; padding-block: 14px 10px; }
    .account-actions { margin-left: auto; }
    .trust { flex-wrap: wrap; justify-content: center; gap: 16px 28px; }
    .feature-card { scroll-margin-top: 140px; }
  }
  @media (max-width: 719px) {
    .wrap, .header-inner { width: calc(100% - 40px); }
    .wordmark { font-size: 1rem; gap: 6px; }
    .account-actions { gap: 0; }
    .account-actions .btn { font-size: 0.76rem; min-height: 38px; padding-inline: 10px; }
    .account-actions .primary :global(svg) { display: none; }
    nav { margin-right: 8px; }
    nav a { font-size: 0.75rem; }
    .hero { padding-block: 36px 28px; }
    h1 { font-size: clamp(2.3rem, 9vw, 3.8rem); }
    .hero-brand { gap: 10px; }
    .hero-tagline { font-size: 1rem; }
    .hero-benefit { margin-top: 24px; }
    .intro { font-size: 0.95rem; }
    .trial-note { font-size: 0.68rem; }
    .feature-grid { grid-template-columns: 1fr; }
    .feature-copy { padding: 24px; }
    .feature-copy > p { font-size: 0.9rem; }
    .feature-copy h4 { font-size: 0.95rem; }
    .feature-media :global(video) { aspect-ratio: 16 / 10; }
    .trust { align-items: flex-start; flex-direction: column; gap: 16px; padding-block: 20px; }
    .closing { padding-block: 44px; }
    footer { column-gap: 20px; row-gap: 16px; }
    footer p { margin: 0; }
  }
  @media (max-width: 359px) {
    .wrap, .header-inner { width: calc(100% - 28px); }
    .wordmark { font-size: 0.85rem; }
    .wordmark :global(svg) { width: 22px; }
    .account-actions .btn { padding-inline: 8px; }
    .hero-tagline { font-size: 0.9rem; }
  }
</style>
