import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.argv[2] || 'dist';
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const policy = config.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
const scriptPolicy = policy.split(';').find(s => s.trim().startsWith('script-src '));
assert.doesNotMatch(scriptPolicy, /unsafe-inline|unsafe-eval/);
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const artifact = files(root);
let htmlCount = 0;
for (const file of artifact.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8'); htmlCount++;
  assert.match(html, /src="\/measurement-bootstrap.js"/);
  assert.match(html, /src="\/admin-theme.js"/);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/ld\+json"/.test(script[1])) continue; // inert structured data
    assert.match(script[1], /\bsrc="/, `Executable inline script in ${file}`);
    const src = script[1].match(/\bsrc="([^"]+)"/)[1];
    assert.ok(src.startsWith('/') && !src.startsWith('//'), `Unapproved initial script in ${file}`);
    assert.ok(fs.existsSync(path.join(root, src)), `Missing build script in ${file}`);
  }
}
assert.ok(htmlCount > 0);
// Exact-value comparison only; never print credentials, keys or environment contents.
const privateValues = [];
for (const name of fs.readdirSync('.').filter(f => /^\.env.*\.local$/.test(f))) {
  for (const line of fs.readFileSync(name, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*["']?([^\r\n]+?)["']?$/);
    if (match && !match[1].startsWith('VITE_') && /SECRET|SECURITY_KEY|SERVICE_ROLE|ACCESS_TOKEN|API_KEY|PASSWORD/.test(match[1]) && match[2].length >= 20) privateValues.push(match[2]);
  }
}
for (const file of artifact.filter(f => /\.(js|html|json|map)$/.test(f))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const value of privateValues) assert.ok(!content.includes(value), `Private environment value found in ${file}`);
}
console.log(`Artifact verified: ${htmlCount} HTML files; executable scripts external; no script unsafe-inline/eval; private-value scan passed.`);
