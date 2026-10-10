<script lang="ts">
  import Icon from './Icon.svelte';
  import DemoLoop from './DemoLoop.svelte';
</script>

<div class="landing">
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="header-inner">
      <a class="wordmark" href="/" aria-label="Compare Sketch home"><Icon name="logo" size={26} /><span>Compare Sketch</span></a>
      <nav aria-label="Main navigation">
        <a href="#compare">Compare</a><a href="#measure">Measure</a><a href="/pricing">Pricing</a>
      </nav>
      <div class="account-actions"><a class="btn quiet" href="/signin">Sign in</a><a class="btn primary" href="/signup">Start free <Icon name="next" size={15} /></a></div>
    </div>
  </header>

  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">A closer look at your art</p>
        <h1 id="hero-title">See the difference.<br /><span>Measure the details.</span></h1>
        <p class="intro">Bring your reference and sketch into focus. Align your photos, compare the parts that matter, and understand every proportion.</p>
        <div class="hero-actions"><a class="btn primary" href="/signup">Start your free trial <Icon name="next" size={18} /></a><a class="watch-link" href="#compare">See how it works <span aria-hidden="true">↓</span></a></div>
        <p class="trial-note"><Icon name="check" size={16} />3 months. All features. No credit card needed.</p>
      </div>
      <div class="hero-demo">
        <div class="demo-heading"><span class="chip accent"><Icon name="parts" size={14} />Compare parts</span><span>Reference → your sketch</span></div>
        <DemoLoop name="compare-parts" label="part comparison demo" width={1280} height={538} />
        <p class="demo-note">From the whole portrait to the smallest detail.</p>
      </div>
    </section>

    <div class="trust wrap">
      <span><Icon name="image" />Use your own reference & sketch photos</span>
      <span><Icon name="check" />Image processing stays in your browser</span>
      <span><Icon name="measure" />Compare shapes. Check proportions.</span>
    </div>

    <section id="compare" class="feature wrap" aria-labelledby="compare-title">
      <figure class="alignment-demo">
        <div class="frame-caption"><strong>Reference & sketch</strong><span class="chip ok"><Icon name="check" size={13} />Manually aligned</span></div>
        <img src="/demos/manual-aligned.jpg" width={1280} height={484} loading="lazy" alt="Saved manual alignment of a portrait reference and a pencil sketch, with matching eye, nose and lip regions." />
        <figcaption>A saved manual alignment from the recorded portrait study.</figcaption>
      </figure>
      <div class="feature-copy">
        <p class="eyebrow">01 / Compare</p>
        <h2 id="compare-title">Same perspective.<br />A clearer comparison.</h2>
        <p>Line up your reference and sketch with matching anchor points. Then look beyond the whole image: compare an eye, a nose, a mouth—or any region you choose.</p>
        <ul><li><Icon name="manual" />Manual alignment puts you in control</li><li><Icon name="parts" />Compare matching parts side by side</li><li><Icon name="overlay" />Switch to an overlay to spot differences</li></ul>
        <a class="text-link" href="/signup">Take a closer look <Icon name="next" size={16} /></a>
      </div>
    </section>

    <section id="measure" class="feature measure-feature wrap" aria-labelledby="measure-title">
      <div class="feature-copy">
        <p class="eyebrow">02 / Measure</p>
        <h2 id="measure-title">Less guesswork.<br />More understanding.</h2>
        <p>Is that feature too wide? Is the spacing too tall? Set a reference scale once, then check horizontal and vertical spans as you move across the image.</p>
        <ul><li><Icon name="horizontal" />Check feature width and spacing</li><li><Icon name="vertical" />Check feature height and vertical distance</li><li><Icon name="measure" />See proportions and calibrated units live</li></ul>
        <p class="measurement-note">Image-space proportions, not perspective-correct physical measurements.</p>
      </div>
      <DemoLoop name="measure" label="width and height measurement demo" width={1280} height={680} />
    </section>

    <section class="detail-section wrap" aria-labelledby="detail-title">
      <div class="section-heading"><p class="eyebrow">Made for the details</p><h2 id="detail-title">Keep your eye on the mark.</h2><p>Small tools that make a big difference when precision matters.</p></div>
      <div class="detail-grid">
        <article>
          <DemoLoop name="line-colors" label="measurement line colors demo" width={1000} height={820} />
          <div class="detail-copy"><h3>Guides that stand out.</h3><p>Change measurement-line colors to suit dark strokes or light paper. Keep the image readable, and the measurement visible.</p><div class="color-key" aria-label="Available guide colors: white, red, yellow, blue, black"><span style="--swatch: #ffffff"></span><span style="--swatch: #ff0000"></span><span style="--swatch: #ffff00"></span><span style="--swatch: #3050d0"></span><span style="--swatch: #000000"></span><small>Your image. Your contrast.</small></div></div>
        </article>
        <article>
          <DemoLoop name="magnify" label="3× magnifier demo" width={1000} height={820} />
          <div class="detail-copy"><h3>A closer look. A better-placed point.</h3><p>The 3× magnifier follows your cursor so you can place and refine points without losing sight of the larger image.</p><span class="chip">3× detail · precise point placement</span></div>
        </article>
      </div>
    </section>

    <section class="closing wrap" aria-labelledby="closing-title">
      <p class="eyebrow">Your next study starts here</p>
      <h2 id="closing-title">Compare. Measure.<br />See your work with fresh eyes.</h2>
      <p>Everything you need for a closer look, free for 3 months.</p>
      <a class="btn primary" href="/signup">Create your free account <Icon name="next" size={18} /></a>
      <p class="trial-note">No credit card needed. Already have an account? <a href="/signin">Sign in</a></p>
    </section>
  </main>

  <footer class="wrap"><a class="wordmark" href="/"><Icon name="logo" size={22} /><span>Compare Sketch</span></a><p>Built for a closer look.</p><a href="/pricing">Plans & pricing</a><a href="/signin">Sign in</a></footer>
</div>

<style>
  .landing { min-height: 100dvh; }
  .wrap, .header-inner { margin-inline: auto; max-width: 1200px; width: calc(100% - 96px); }
  header { background: var(--surface-frost); border-bottom: 1px solid var(--hairline); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(14px); }
  .header-inner { align-items: center; display: flex; gap: 32px; min-height: 80px; }
  .wordmark { align-items: center; color: var(--ink); display: inline-flex; font-size: 1rem; font-weight: 600; gap: 10px; text-decoration: none; white-space: nowrap; }
  .wordmark :global(svg) { color: var(--accent); }
  nav { display: flex; gap: 28px; margin-left: auto; }
  nav a, footer > a:not(.wordmark) { color: var(--ink-muted); font-size: 0.85rem; text-decoration: none; }
  nav a:hover, footer > a:hover { color: var(--accent); }
  .account-actions { display: flex; gap: 8px; }
  .hero { align-items: center; display: grid; gap: 48px; grid-template-columns: 0.9fr 1.1fr; padding-block: 94px 76px; }
  .eyebrow { color: var(--accent); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.12em; margin-bottom: 20px; text-transform: uppercase; }
  h1 { font-size: clamp(2.5rem, 4.15vw, 3.6rem); letter-spacing: -0.055em; line-height: 1.09; }
  h1 span { color: var(--accent); }
  .intro { color: var(--ink-muted); font-size: 1.08rem; line-height: 1.7; margin-top: 24px; max-width: 440px; }
  .hero-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 24px; margin-top: 32px; }
  .hero-actions .btn, .closing .btn { min-height: 48px; padding-inline: 20px; }
  .watch-link { color: var(--ink); font-size: 0.84rem; text-decoration: none; }
  .watch-link span { margin-left: 6px; }
  .trial-note { align-items: center; color: var(--ink-muted); display: flex; flex-wrap: wrap; font-size: 0.76rem; gap: 6px; margin-top: 16px; }
  .trial-note :global(svg) { color: var(--ok); }
  .demo-heading { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.72rem; justify-content: space-between; margin-bottom: 14px; }
  .demo-note { color: var(--ink-muted); font-size: 0.78rem; margin-top: 16px; text-align: center; }
  .trust { align-items: center; border-block: 1px solid var(--hairline); display: flex; gap: 24px; justify-content: space-between; padding-block: 24px; }
  .trust > span { align-items: center; color: var(--ink-muted); display: flex; font-size: 0.78rem; gap: 10px; }
  .trust :global(svg) { color: var(--accent); }
  .feature { align-items: center; display: grid; gap: 80px; grid-template-columns: 1.1fr 0.9fr; padding-block: 96px 48px; scroll-margin-top: 96px; }
  .measure-feature { grid-template-columns: 0.9fr 1.1fr; padding-block: 64px 96px; }
  h2 { font-size: clamp(1.9rem, 2.9vw, 2.6rem); letter-spacing: -0.045em; line-height: 1.16; }
  .feature-copy > p:not(.eyebrow), .section-heading > p:last-child, .detail-copy p { color: var(--ink-muted); font-size: 0.95rem; line-height: 1.75; margin-top: 20px; }
  ul { display: flex; flex-direction: column; gap: 14px; list-style: none; margin-top: 24px; }
  li { align-items: center; display: flex; font-size: 0.85rem; gap: 12px; }
  li :global(svg) { color: var(--accent); }
  .text-link { align-items: center; color: var(--accent); display: inline-flex; font-size: 0.88rem; font-weight: 500; gap: 10px; margin-top: 28px; text-decoration: none; }
  .alignment-demo { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
  .alignment-demo img { display: block; height: auto; width: 100%; }
  .alignment-demo .frame-caption { justify-content: space-between; padding: 12px 16px; }
  .alignment-demo figcaption { color: var(--ink-muted); font-size: 0.72rem; padding: 14px 16px; }
  .feature-copy > .measurement-note { font-size: 0.72rem !important; }
  .detail-section { border-top: 1px solid var(--hairline); padding-block: 64px 88px; }
  .section-heading { margin-bottom: 36px; text-align: center; }
  .section-heading .eyebrow { margin-bottom: 12px; }
  .section-heading > p:last-child { margin-top: 12px; }
  .detail-grid { display: grid; gap: 32px; grid-template-columns: 1fr 1fr; }
  .detail-copy { padding: 24px 8px 0; }
  h3 { font-size: 1.3rem; letter-spacing: -0.025em; }
  .detail-copy p { margin-top: 10px; }
  .color-key { align-items: center; display: flex; gap: 8px; margin-top: 20px; }
  .color-key > span { background: var(--swatch); border: 1px solid var(--border-strong); border-radius: 50%; height: 16px; width: 16px; }
  .color-key small { color: var(--ink-muted); font-size: 0.72rem; margin-left: 6px; }
  .detail-copy > .chip { margin-top: 20px; }
  .closing { background: var(--surface); border: 1px solid var(--hairline); border-radius: 20px; padding: 60px 24px; text-align: center; }
  .closing > p:not(.eyebrow) { color: var(--ink-muted); margin-top: 20px; }
  .closing .btn { margin-top: 28px; }
  .closing .trial-note { justify-content: center; }
  .closing .trial-note a { color: var(--accent); }
  footer { align-items: center; display: flex; flex-wrap: wrap; gap: 24px; padding-block: 36px; }
  footer p { color: var(--ink-muted); font-size: 0.78rem; margin-right: auto; }
  footer .wordmark { font-size: 0.9rem; }
  .skip-link { background: var(--surface); color: var(--accent); left: 16px; padding: 12px; position: fixed; top: -80px; z-index: 20; }
  .skip-link:focus { top: 12px; }
  a:not(.btn):hover { text-decoration: underline; }
  @media (max-width: 1000px) {
    .wrap, .header-inner { width: calc(100% - 48px); }
    .header-inner { gap: 20px; }
    nav { gap: 18px; }
    .hero { gap: 28px; padding-block: 64px; }
    .feature { gap: 40px; }
    .trust { gap: 16px; }
  }
  @media (max-width: 719px) {
    .wrap, .header-inner { width: calc(100% - 40px); }
    .header-inner { flex-wrap: wrap; gap: 8px; padding-block: 14px 10px; }
    .wordmark { font-size: 0.9rem; gap: 6px; }
    .account-actions { gap: 0; margin-left: auto; }
    .account-actions .btn { font-size: 0.78rem; min-height: 38px; padding-inline: 10px; }
    .account-actions .primary :global(svg) { display: none; }
    nav { border-top: 1px solid var(--hairline); justify-content: center; margin-top: 8px; order: 3; padding-top: 10px; width: 100%; }
    .hero { gap: 36px; grid-template-columns: 1fr; padding-block: 48px 40px; }
    h1 { font-size: clamp(2.3rem, 8vw, 3.5rem); }
    .intro { font-size: 1rem; }
    .hero-actions { gap: 20px; margin-top: 26px; }
    .trial-note { font-size: 0.7rem; }
    .trust { align-items: flex-start; flex-direction: column; gap: 16px; padding-block: 20px; }
    .feature, .measure-feature { gap: 28px; grid-template-columns: 1fr; padding-block: 52px 0; scroll-margin-top: 135px; }
    .feature-copy { grid-row: 1; }
    .feature-copy .eyebrow { margin-bottom: 14px; }
    .measure-feature { padding-bottom: 52px; }
    .detail-section { padding-block: 44px; }
    .detail-grid { gap: 36px; grid-template-columns: 1fr; }
    .detail-copy { padding-inline: 0; }
    .closing { padding-block: 40px; }
    footer { column-gap: 20px; row-gap: 16px; }
    footer p { margin: 0; }
  }
  @media (max-width: 359px) {
    .wrap, .header-inner { width: calc(100% - 28px); }
    .wordmark { font-size: 0.8rem; }
    .wordmark :global(svg) { width: 20px; }
    .account-actions .btn { padding-inline: 8px; }
    .alignment-demo .frame-caption { flex-wrap: wrap; gap: 8px; }
  }
</style>
