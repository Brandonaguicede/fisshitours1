import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase public environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Invalid protocol');
  }
} catch {
  throw new Error('Invalid VITE_SUPABASE_URL configuration.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const functionsUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
