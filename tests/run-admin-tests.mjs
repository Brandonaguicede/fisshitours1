// Starts the dev server in `test` mode (loads .env.test — the mocked
// admin-test.supabase.co project, never the real one from .env.local),
// waits for it to answer, runs the admin *.test.mjs suite against it, then
// always tears the server down. This is what `npm run test:admin` calls.
//
// Usage: npm run test:admin
// (add extra node --test args after `--`, e.g. `npm run test:admin -- --test-name-pattern=foo`)

import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = 5174;
// Vite's default dev server binds to `localhost`, which on some Windows
// setups only resolves to the IPv6 loopback (::1) — `127.0.0.1` then
// connection-refuses even though the server is up. Use `localhost` here to
// match whatever Vite actually bound to.
const BASE_URL = `http://localhost:${PORT}`;

function spawnNpm(args) {
  // npm ships as a .cmd shim on Windows; spawning it needs shell:true, and
  // Node then wants a single command string (not an args array) to avoid
  // its own argument-escaping warning.
  if (process.platform === 'win32') return spawn(['npm', ...args].join(' '), { stdio: 'inherit', shell: true });
  return spawn('npm', args, { stdio: 'inherit' });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not respond at ${url} within ${timeoutMs}ms`);
}

async function killServer() {
  // With shell:true on Windows, server.kill() only kills the shell, leaving
  // npm/vite as orphaned grandchildren that keep holding the port for the
  // next run — taskkill /t kills the whole tree. Wait for it to actually
  // finish before this script exits, or the parent process can end while
  // the port is still held.
  if (process.platform === 'win32' && server.pid) {
    await new Promise((resolve) => spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']).on('close', resolve));
  } else {
    server.kill();
  }
}

const server = spawnNpm(['run', 'dev', '--', '--mode', 'test', '--port', String(PORT), '--strictPort']);
let exitCode = 1;

try {
  await waitForServer(`${BASE_URL}/admin/login`);
  const extraArgs = process.argv.slice(2);
  const testFiles = ['tests/admin-dashboard.test.mjs', 'tests/admin-confirm-booking.test.mjs', 'tests/admin-list-service.test.mjs', 'tests/admin-pagination.test.mjs', 'tests/admin-critical-flows.test.mjs', 'tests/booking-payment-method-key.test.mjs', 'tests/admin-security-hardening.test.mjs', 'tests/admin-management-rules.test.mjs', 'tests/admin-drafts-and-reorder.test.mjs', 'tests/public-catalog-order.test.mjs', 'tests/i18n-static-content.test.mjs', 'tests/paypal-checkout-lifecycle.test.mjs'];
  const node = spawn(process.execPath, ['--test', ...testFiles, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, ADMIN_TEST_BASE_URL: BASE_URL },
  });
  exitCode = await new Promise((resolve) => node.on('close', resolve));
} finally {
  await killServer();
}

process.exit(exitCode ?? 1);
