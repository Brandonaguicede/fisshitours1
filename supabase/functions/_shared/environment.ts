export function areExternalProviderMocksAllowed(): boolean {
  const mockEnabled = Deno.env.get('MOCK_EXTERNAL_PROVIDERS') === 'true';
  const appEnvironment = Deno.env.get('APP_ENV')?.toLowerCase();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const isLocalSupabase = supabaseUrl.startsWith('http://127.0.0.1')
    || supabaseUrl.startsWith('http://localhost')
    || supabaseUrl.startsWith('http://kong:8000')
    || Boolean(Deno.env.get('SUPABASE_INTERNAL_HOST_PORT'));

  return mockEnabled && (appEnvironment === 'local' || appEnvironment === 'test') && isLocalSupabase;
}
