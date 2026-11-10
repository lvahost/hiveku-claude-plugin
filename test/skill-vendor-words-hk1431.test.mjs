import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('HK-1431: plugin skills and commands never name the web reading vendor', () => {
  const files = [
    ...walkMarkdown(path.join(ROOT, 'skills')),
    ...walkMarkdown(path.join(ROOT, 'commands')),
  ];
  assert.ok(files.length >= 20, 'expected skills and commands markdown files');
  const offenders = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (/firecrawl|crawl4ai/i.test(content)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('HK-1431: indexed web reading, redesign, and screenshot tools name no web reading vendor', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'tool-index.json'), 'utf8'));
  const byName = new Map((index.tools ?? []).map((t) => [t.name, t]));
  const names = [
    'web_scrape',
    'web_map',
    'web_crawl',
    'web_search',
    'web_extract',
    'web_actions',
    'redesign_start',
    'redesign_import',
    'preview_screenshot',
    'web_search_brave',
    'fetch_url',
  ];
  for (const name of names) {
    const entry = byName.get(name);
    assert.ok(entry, `expected ${name} in lib/tool-index.json`);
    assert.doesNotMatch(entry.description, /firecrawl|crawl4ai/i, `${name} should not name vendor`);
  }
});
