import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isValidPublicSupabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const parsedUrl = new URL(value);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(isValidPublicSupabaseUrl(supabaseUrl) && supabaseAnonKey);
export const supabaseConfigurationError = !supabaseUrl || !supabaseAnonKey
  ? 'Missing Supabase public environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  : !isValidPublicSupabaseUrl(supabaseUrl)
    ? 'Invalid VITE_SUPABASE_URL configuration.'
    : '';

const publicSupabaseUrl = isSupabaseConfigured ? supabaseUrl : 'https://example.invalid';
const publicSupabaseAnonKey = isSupabaseConfigured ? supabaseAnonKey : 'missing-public-supabase-key';

export const supabase = createClient<Database>(publicSupabaseUrl, publicSupabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const functionsUrl = `${publicSupabaseUrl.replace(/\/$/, '')}/functions/v1`;
