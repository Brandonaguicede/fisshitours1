import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TERMS_VERSIONS } from '../supabase/functions/_shared/terms.mjs';

// v1 (supabase/functions/_shared/terms.mjs) is the ONLY place where contractual policy text may live. The old paraphrased copy
// (getBookingTerms) was removed; these tests keep it from coming back under another name.

const SOURCE_DIRS = ['src', 'supabase/functions'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.json']);
const SOURCE_OF_TRUTH = path.normalize('supabase/functions/_shared/terms.mjs');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.d.mts')) yield full;
  }
}
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const files = SOURCE_DIRS.flatMap((dir) => [...walk(dir)]).filter((file) => path.normalize(file) !== SOURCE_OF_TRUTH);

test('the legacy paraphrased policy list is gone: no getBookingTerms anywhere in src / supabase / tests', () => {
  const offenders = [];
  for (const dir of [...SOURCE_DIRS, 'tests']) for (const file of walk(dir)) {
    if (path.normalize(file) === path.normalize('tests/terms-single-source.test.mjs')) continue;
    if (/getBookingTerms/.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('no contractual wording (penalties, refunds, deposits, rescheduling, weather rules, no-show) outside terms.mjs', () => {
  // Status codes such as `refunded` / "Reembolsado" are not policy text, hence the word boundaries.
  const contractual = /\bpenalty\b|penalidad|penalizaci[oó]n|hurricane|huracane|reschedul|reprogram|\bdeposit\b|dep[oó]sito del|\bno[- ]show\b|\brefund\b|reembolso\b|derecho a reembolso|cancelaci[oó]n(es)? (dentro|sin|con|al menos)|cancellations? (within|at least|before|with)/i;
  const offenders = [];
  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const hit = contractual.exec(code);
    if (hit) offenders.push(`${file}: "${hit[0]}"`);
  }
  assert.deepEqual(offenders, [], 'contractual text must come from getTerms(...) (terms.mjs), never be re-typed');
});

test('no v1 sentence is duplicated anywhere else: every policy line exists only in terms.mjs', () => {
  const lines = TERMS_VERSIONS.v1.sections.flatMap((section) => section.items.flatMap((item) => [item.en, item.es]));
  assert.ok(lines.length >= 28);
  const corpus = files.map((file) => [file, fs.readFileSync(file, 'utf8')]);
  const duplicated = [];
  for (const line of lines) {
    const fragment = line.slice(0, 45); // the opening words are enough to detect a copy or a light paraphrase of the same sentence
    for (const [file, content] of corpus) if (content.includes(fragment)) duplicated.push(`${file}: "${fragment}"`);
  }
  assert.deepEqual(duplicated, []);
});

test('every screen that shows policies reads them from the versioned source (CURRENT_TERMS_VERSION + getTerms)', () => {
  const modal = fs.readFileSync('src/components/booking/TermsModal.tsx', 'utf8');
  assert.match(modal, /from '\.\.\/\.\.\/\.\.\/supabase\/functions\/_shared\/terms\.mjs'/);
  assert.match(modal, /getTerms\(version, language\)/);
  assert.match(modal, /version = CURRENT_TERMS_VERSION/);
  const email = fs.readFileSync('supabase/functions/_shared/booking-confirmation-email.ts', 'utf8');
  assert.match(email, /from '\.\/terms\.mjs'/);
  assert.match(email, /getTerms\(version, language\)/);
  assert.match(email, /renderTermsText\(termsVersion, language\)/);
  // The public screens only LINK to the modal; they do not carry policy text of their own.
  for (const file of ['src/pages/BookingPage.tsx', 'src/components/booking/BookingPanel.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /TermsLink|TermsConsent/, `${file} links to the terms modal`);
  }
});

test('only terms.mjs and the email template read the policy text from the registry; the Edge Functions only validate the version', () => {
  const importers = files.filter((file) => /_shared\/terms\.mjs|\.\/terms\.mjs/.test(fs.readFileSync(file, 'utf8'))).map((file) => file.split(path.sep).join('/')).sort();
  assert.deepEqual(importers, [
    'src/components/booking/BookingPanel.tsx',
    'src/components/booking/TermsModal.tsx',
    'supabase/functions/_shared/booking-confirmation-email.ts',
    'supabase/functions/admin-create-booking/index.ts',
    'supabase/functions/create-booking/index.ts',
  ]);
});
