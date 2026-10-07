import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const authConfigurationError = !url || !key
  ? 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the shared Supabase project URL and public browser key, then rebuild or restart the app.'
  : key.startsWith('sb_secret_')
    ? 'Supabase requires a public publishable/anon browser key, never a secret key.'
    : null;

export const supabase = authConfigurationError ? null : createClient(url!, key!, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // The root exchanges callback codes once and handles failures explicitly.
    detectSessionInUrl: false
  }
});
