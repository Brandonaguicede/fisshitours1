import { createClient, type Session } from '@supabase/supabase-js';

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
export const supabasePublishableKey = publicSupabaseAnonKey;

export const recoveryLinkHasError = typeof window !== 'undefined' &&
  ['error', 'error_code'].some((key) =>
    new URLSearchParams(window.location.hash.slice(1)).has(key) ||
    new URLSearchParams(window.location.search).has(key));

export const supabase = createClient<Database>(publicSupabaseUrl, publicSupabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const recoveryStorageKey = 'papagayo-password-recovery';
let recoveryUserId: string | null = null;
try { recoveryUserId = sessionStorage.getItem(recoveryStorageKey); } catch { /* Storage may be unavailable. */ }

export function clearRecoverySession() {
  recoveryUserId = null;
  try { sessionStorage.removeItem(recoveryStorageKey); } catch { /* In-memory fallback. */ }
}

export function isRecoverySession(session: Session | null) {
  return Boolean(session && session.user.id === recoveryUserId && !recoveryLinkHasError);
}

// Register before lazy routes mount; never await Auth methods in this callback.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    recoveryUserId = session.user.id;
    try { sessionStorage.setItem(recoveryStorageKey, recoveryUserId); } catch { /* In-memory fallback. */ }
  } else if (event === 'SIGNED_OUT' || (session && recoveryUserId !== session.user.id)) {
    clearRecoverySession();
  }
});

export const functionsUrl = `${publicSupabaseUrl.replace(/\/$/, '')}/functions/v1`;
