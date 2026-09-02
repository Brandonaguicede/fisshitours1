import { execSync } from 'node:child_process';

async function waitForSupabaseRest() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const deadline = Date.now() + 90_000;
  let lastError = '';

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, { signal: controller.signal });
      if (response.status > 0) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Supabase REST did not become reachable after db reset. Last error: ${lastError}`);
}

function runReset(attempt: number) {
  try {
    execSync('npx supabase db reset --local', {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
      timeout: 300_000,
    });
    return true;
  } catch (error) {
    if (attempt >= 3) throw error;
    execSync('ping -n 11 127.0.0.1 > nul', { stdio: 'ignore' });
    return false;
  }
}

function runStart() {
  execSync('npx supabase start', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    timeout: 300_000,
  });
}

export default async function globalSetup() {
  if (process.env.SKIP_SUPABASE_RESET === '1') return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (runReset(attempt)) {
      runStart();
      await waitForSupabaseRest();
      return;
    }
  }
}
