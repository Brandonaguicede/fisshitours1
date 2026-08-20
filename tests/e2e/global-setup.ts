import { execSync } from 'node:child_process';

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

export default function globalSetup() {
  if (process.env.SKIP_SUPABASE_RESET === '1') return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (runReset(attempt)) return;
  }
}
