// Vite configuration is baked into the browser bundle, not read by nginx.
// This explicit public-only file also works with InstaCloud's source archive
// deployment, whose CLI does not accept Docker --build-arg flags.
export function publicBuildEnvironment(config: Record<string, unknown>): Record<string, string> {
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  if (Object.keys(config).some((name) => !names.includes(name))) {
    throw new Error('Public build configuration may contain only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const url = typeof config.VITE_SUPABASE_URL === 'string' ? config.VITE_SUPABASE_URL.trim() : '';
  const key = typeof config.VITE_SUPABASE_ANON_KEY === 'string' ? config.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !key) {
    throw new Error('Supply both public Supabase build variables; refusing to build an app with authentication disabled.');
  }
  const parsed = new URL(url);
  // HTTP loopback is allowed only to run the existing disposable auth tests.
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))) {
    throw new Error('Use an HTTPS Supabase URL (HTTP loopback is for local tests only).');
  }
  let publicKey = key.startsWith('sb_publishable_');
  if (!publicKey) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      publicKey = key.split('.').length === 3 && payload.role === 'anon';
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey) {
    throw new Error('Use only a Supabase public publishable or legacy anon key, never a secret/service-role key.');
  }
  return { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key };
}

if (import.meta.main) {
  const file = Bun.file('deploy/public-build.json');
  const config = await file.exists() ? await file.json() : {
    VITE_SUPABASE_URL: Bun.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: Bun.env.VITE_SUPABASE_ANON_KEY
  };
  const env = publicBuildEnvironment(config);
  const build = Bun.spawn(['bun', 'run', 'build'], {
    env: { ...Bun.env, ...env }, stdout: 'inherit', stderr: 'inherit'
  });
  process.exit(await build.exited);
}
