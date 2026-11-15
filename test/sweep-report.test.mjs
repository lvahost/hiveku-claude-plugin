import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { maskSecrets, reportRows } from '../lib/sweep-report.mjs';

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

test('ordinary words and short previews are left as they are', () => {
  for (const text of ['ok', 'needs params: id', 'key preview hvk_c903', 'sk-short']) {
    assert.equal(maskSecrets(text), text);
  }
});

test('the sweep writes its report through reportRows', () => {
  const script = fs.readFileSync(new URL('../scripts/sweep-tools.mjs', import.meta.url), 'utf8');
  assert.match(script, /import \{ reportRows \} from '\.\.\/lib\/sweep-report\.mjs';/);
  assert.match(script, /results: reportRows\(results\),/);
});
