// Run against the production container, not Vite's different static server.
const origin = new URL(Bun.argv[2] ?? 'http://localhost:8080').origin;
function check(value: boolean, message: string) {
  if (!value) throw new Error(message);
}
const root = await fetch(origin);
const html = await root.text();
check(root.status === 200 && html.includes('<div id="app"></div>'), 'Root serves the built SPA');
check(root.headers.get('cache-control') === 'no-cache', 'HTML revalidates on redeploy');
for (const path of ['/auth/callback?code=smoke-test-code', '/auth/reset-password?code=smoke-test-code']) {
  const response = await fetch(origin + path);
  check(response.status === 200 && await response.text() === html, `SPA fallback: ${path}`);
  check(response.headers.get('referrer-policy') === 'no-referrer', 'Callbacks do not leak codes through referrers');
  const head = await fetch(origin + path, { method: 'HEAD' });
  check(head.status === 200 && head.headers.get('content-type')?.includes('text/html') === true, `HEAD fallback: ${path}`);
}
const health = await fetch(origin + '/healthz');
check(health.status === 200 && await health.text() === 'ok\n', 'Health endpoint answers');
check(health.headers.get('cache-control') === 'no-store', 'Health is never cached');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1]);
check(assets.some((path) => path.endsWith('.js')) && assets.some((path) => path.endsWith('.css')), 'Built JS and CSS are linked');
for (const path of [...assets, '/vendor/opencv-4.9.0.js']) {
  const response = await fetch(origin + path, { headers: { 'Accept-Encoding': 'gzip' } });
  check(response.status === 200 && !response.headers.get('content-type')?.includes('text/html'), `Static asset: ${path}`);
  check(response.headers.get('content-encoding') === 'gzip', `Compressed asset: ${path}`);
  check(response.headers.get('x-content-type-options') === 'nosniff', 'Assets retain security headers');
  const cache = response.headers.get('cache-control') ?? '';
  check(path.startsWith('/assets/') ? cache.includes('immutable') : cache === 'no-cache', `Correct cache lifetime: ${path}`);
  await response.arrayBuffer();
}
for (const path of ['/assets/missing.js', '/vendor/missing.js']) {
  const missing = await fetch(origin + path);
  check(missing.status === 404, `Missing asset is not SPA HTML: ${path}`);
  check(!missing.headers.get('cache-control')?.includes('immutable'), 'Missing assets must not be cached for a year');
}
console.log('PASS: production HTML; GET/HEAD auth-route fallback; health; JS/CSS/OpenCV serving, gzip and caching; security headers; missing asset 404s.');
