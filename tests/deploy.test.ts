import { expect, test } from 'bun:test';
import { publicBuildEnvironment } from '../deploy/build';

const valid = { VITE_SUPABASE_URL: 'https://shared-project.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_only' };
const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('public build configuration accepts publishable and legacy anon keys, and trims values', () => {
  expect(publicBuildEnvironment({ ...valid, VITE_SUPABASE_URL: ` ${valid.VITE_SUPABASE_URL} ` })).toEqual(valid);
  expect(publicBuildEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: jwt('anon') }).VITE_SUPABASE_ANON_KEY).toBe(jwt('anon'));
});

test('production build refuses missing configuration, privileged keys, and extra fields', () => {
  for (const config of [
    {}, { ...valid, VITE_SUPABASE_URL: '' }, { ...valid, VITE_SUPABASE_ANON_KEY: '' },
    { ...valid, VITE_SUPABASE_ANON_KEY: 'sb_secret_do_not_build' },
    { ...valid, VITE_SUPABASE_ANON_KEY: jwt('service_role') },
    { ...valid, VITE_SUPABASE_ANON_KEY: 'not-a-key' },
    { ...valid, DATABASE_URL: 'must-not-be-uploaded' }
  ]) expect(() => publicBuildEnvironment(config)).toThrow();
});

test('Supabase URL must be HTTPS without credentials or query data; loopback supports mock tests only', () => {
  for (const url of ['http://shared-project.supabase.co', 'ftp://example.test', 'https://user:pass@example.test', 'https://example.test?secret=x', 'https://example.test#secret', 'not-a-url']) {
    expect(() => publicBuildEnvironment({ ...valid, VITE_SUPABASE_URL: url })).toThrow();
  }
  expect(publicBuildEnvironment({ ...valid, VITE_SUPABASE_URL: 'http://127.0.0.1:54325' }).VITE_SUPABASE_URL).toBe('http://127.0.0.1:54325');
});
