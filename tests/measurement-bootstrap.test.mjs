import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('real bootstrap denies by default, loads once and recovers only from definitive errors', async () => {
  let now = 1000;
  const scripts = [];
  const window = {};
  const context = vm.createContext({ window, Promise, Date: { now: () => now }, document: {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: script => scripts.push(script) },
  } });
  vm.runInContext(fs.readFileSync('public/measurement-bootstrap.js', 'utf8'), context);
  assert.match(fs.readFileSync('public/measurement-bootstrap.js', 'utf8'), /GTM-T5RBJH88/);
  assert.doesNotMatch(fs.readFileSync('public/measurement-bootstrap.js', 'utf8'), /GTM-5CZ3P6NW/);
  assert.equal(window.dataLayer[0][0], 'consent');
  assert.equal(window.dataLayer[0][2].analytics_storage, 'denied');
  assert.equal(await window.pftLoadGtm(), false);
  assert.equal(scripts.length, 0);
  window.pftReadConsent = () => ({ analytics: true, marketing: false });
  const first = window.pftLoadGtm();
  assert.equal(window.pftLoadGtm(), first);
  scripts[0].onerror();
  assert.equal(await first, false);
  assert.equal(await window.pftLoadGtm(), false);
  now += 1000;
  const second = window.pftLoadGtm();
  assert.equal(scripts.length, 2);
  assert.equal(scripts[0].removed, true);
  scripts[1].onload();
  assert.equal(await second, true);
  assert.equal(await window.pftLoadGtm(), true);
  assert.equal(scripts.length, 2);
  assert.equal(window.dataLayer.filter(e => e.event === 'gtm.js').length, 1);
});

test('executable bootstrap and theme use same-origin scripts under restrictive CSP', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /src="\/measurement-bootstrap.js"/);
  assert.match(html, /src="\/admin-theme.js"/);
  assert.doesNotMatch(html, /<script>\s*[^<]/);
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const policy = config.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  const script = policy.split(';').find(p => p.trim().startsWith('script-src '));
  assert.match(script, /https:\/\/www\.googletagmanager\.com/);
  assert.match(script, /https:\/\/connect\.facebook\.net/);
  assert.match(script, /https:\/\/cdn\.jsdelivr\.net\/npm\/meta-capi-param-builder-clientjs\/dist\/clientParamBuilder\.bundle\.js/);
  assert.match(script, /https:\/\/unpkg\.com\/meta-capi-param-builder-clientjs\/dist\/clientParamBuilder\.bundle\.js/);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
});
