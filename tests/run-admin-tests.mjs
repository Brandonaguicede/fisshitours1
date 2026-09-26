// Starts the dev server in `test` mode (loads .env.test — the mocked
// admin-test.supabase.co project, never the real one from .env.local),
// waits for it to answer, runs the admin *.test.mjs suite against it, then
// always tears the server down. This is what `npm run test:admin` calls.
//
// Usage: npm run test:admin
// (add extra node --test args after `--`, e.g. `npm run test:admin -- --test-name-pattern=foo`)

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
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

// Vite compiles each lazily-loaded page on its first request. On a cold start that can take
// longer than the tests' 5s expect timeout for whichever test happens to open a page first
// (it kept hitting the Reservas tests, which then saw "Loading..."). Requesting the admin page
// modules once up front moves that one-time cost out of the tests.
async function warmUpAdminPages(baseUrl) {
  const pages = readdirSync('src/pages/admin').filter((file) => file.endsWith('.tsx'));
  for (const file of pages) {
    try { await fetch(`${baseUrl}/src/pages/admin/${file}`); } catch { /* best effort */ }
  }
  // Also load the app once in a real browser so the shared dependency graph (router, supabase
  // client, admin layout...) is transformed too, not just the page modules.
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage();
    for (const path of ['/admin/login', '/admin/reservations']) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    }
    await browser.close();
  } catch { /* best effort — the tests themselves still run without it */ }
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
  await warmUpAdminPages(BASE_URL);
  const extraArgs = process.argv.slice(2);
  const testFiles = ['tests/admin-dashboard.test.mjs', 'tests/admin-dashboard-kpis.test.mjs', 'tests/admin-dashboard-analytics.test.mjs', 'tests/admin-dashboard-overview.test.mjs', 'tests/admin-confirm-booking.test.mjs', 'tests/admin-list-service.test.mjs', 'tests/admin-pagination.test.mjs', 'tests/admin-reservations-export.test.mjs', 'tests/admin-critical-flows.test.mjs', 'tests/booking-payment-method-key.test.mjs', 'tests/admin-security-hardening.test.mjs', 'tests/admin-management-rules.test.mjs', 'tests/admin-drafts-and-reorder.test.mjs', 'tests/departure-locations.test.mjs', 'tests/admin-tour-wizard.test.mjs', 'tests/admin-boat-packages.test.mjs', 'tests/admin-content-translation.test.mjs', 'tests/admin-content-screens.test.mjs', 'tests/admin-action-consistency.test.mjs', 'tests/admin-accessibility.test.mjs', 'tests/admin-export-brand.test.mjs', 'tests/admin-refinement.test.mjs', 'tests/admin-round-two.test.mjs', 'tests/admin-round-three.test.mjs', 'tests/admin-round-four.test.mjs', 'tests/boat-publication-status.test.mjs', 'tests/package-requirements.test.mjs', 'tests/booking-package-completeness.test.mjs', 'tests/translation-public.test.mjs', 'tests/admin-to-landing.test.mjs', 'tests/public-boats-translation.test.mjs', 'tests/package-included-public.test.mjs', 'tests/public-catalog-order.test.mjs', 'tests/i18n-static-content.test.mjs', 'tests/paypal-checkout-lifecycle.test.mjs'];
  const node = spawn(process.execPath, ['--test', ...testFiles, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, ADMIN_TEST_BASE_URL: BASE_URL },
  });
  exitCode = await new Promise((resolve) => node.on('close', resolve));
} finally {
  await killServer();
}

process.exit(exitCode ?? 1);
