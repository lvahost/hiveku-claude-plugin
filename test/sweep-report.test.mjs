import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { failureLine, maskSecrets, reportRows } from '../lib/sweep-report.mjs';

/**
 * A sweep's report never carries a tool's whole answer, and the short detail
 * it keeps never carries a usable key (HK-1800: a 2026-09-11 report held a
 * memory_list answer with a tool's key in plain text).
 */

const HIVEKU_KEY = 'hvk_' + 'A'.repeat(32);

test('a row keeps its verdict but never its whole answer', () => {
  const rows = reportRows([
    { tool: 'memory_list', status: 'ok', detail: 'ok', raw: `{"auth":"X-Hiveku-Key: ${HIVEKU_KEY}"}`, ms: 12 },
  ]);
  assert.deepEqual(rows, [{ tool: 'memory_list', status: 'ok', detail: 'ok', ms: 12 }]);
  assert.equal(JSON.stringify(rows).includes(HIVEKU_KEY), false);
});

test('key and token shapes in the detail are cut to their first characters', () => {
  // Built from parts, so the file holds no token-shaped text.
  const jwt = ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.');
  for (const secret of [HIVEKU_KEY, 'olp_' + 'b'.repeat(40), 'sk-' + 'c'.repeat(30), jwt, 'Bearer ' + 'd'.repeat(30)]) {
    const masked = maskSecrets(`answer: ${secret} end`);
    assert.equal(masked.includes(secret), false, secret.slice(0, 6));
    assert.match(masked, /\.\.\.\[masked\] end$/);
  }
});

test('the other providers\' key shapes are cut too (review)', () => {
  // Built from parts, so the file holds no key-shaped text.
  const secrets = [
    'sk_' + 'live_' + 'e'.repeat(24),
    'rk_' + 'live_' + 'f'.repeat(24),
    'sk_' + 'test_' + 'g'.repeat(24),
    'whsec_' + 'h'.repeat(32),
    'AKIA' + 'J'.repeat(16),
    'ghp_' + 'k'.repeat(36),
    'gho_' + 'k'.repeat(36),
    'ghs_' + 'k'.repeat(36),
    'github_' + 'pat_' + '11' + 'Q'.repeat(20) + '_' + 'r'.repeat(59),
    'xoxb-' + '1'.repeat(12) + '-' + 'm'.repeat(24),
    'xoxp-' + '2'.repeat(12) + '-' + 'n'.repeat(24),
    'AIza' + 'p'.repeat(35),
  ];
  for (const secret of secrets) {
    const masked = maskSecrets(`answer: ${secret} end`);
    assert.equal(masked.includes(secret), false, secret.slice(0, 6));
    assert.match(masked, /\.\.\.\[masked\] end$/);
  }
});

test('a failure the sweep prints to the console is masked as the report is', () => {
  const line = failureLine({ tool: 'memory_list', status: 'error', detail: `500: X-Hiveku-Key ${HIVEKU_KEY} refused` });
  assert.equal(line.includes(HIVEKU_KEY), false);
  assert.equal(line, `    ${'memory_list'.padEnd(46)} 500: X-Hiveku-Key ${HIVEKU_KEY.slice(0, 8)}...[masked] refused`);
  // A detail that is not text prints as it did.
  assert.equal(failureLine({ tool: 'x', detail: undefined }), `    ${'x'.padEnd(46)} undefined`);
});

test('the sweep prints its failures through failureLine', () => {
  const script = fs.readFileSync(new URL('../scripts/sweep-tools.mjs', import.meta.url), 'utf8');
  assert.match(script, /import \{ failureLine, reportRows \} from '\.\.\/lib\/sweep-report\.mjs';/);
  assert.match(script, /for \(const r of err\) console\.log\(failureLine\(r\)\);/);
  assert.equal(script.includes('${r.detail}'), false);
});

test('ordinary words and short previews are left as they are', () => {
  for (const text of ['ok', 'needs params: id', 'key preview hvk_c903', 'sk-short', 'AKIA', 'ghp_short', 'xoxb-1', 'sk_live_short', 'whsec_x']) {
    assert.equal(maskSecrets(text), text);
  }
});

test('the sweep writes its report through reportRows', () => {
  const script = fs.readFileSync(new URL('../scripts/sweep-tools.mjs', import.meta.url), 'utf8');
  assert.match(script, /import \{ failureLine, reportRows \} from '\.\.\/lib\/sweep-report\.mjs';/);
  assert.match(script, /results: reportRows\(results\),/);
});
