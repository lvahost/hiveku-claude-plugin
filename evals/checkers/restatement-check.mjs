#!/usr/bin/env node
/**
 * RESTATEMENT TEST - a deliverable must synthesize, not restate. The failure
 * this catches (from the assertive-media review): an "action plan" that was
 * "just a summarisation of all the points the FULL SITE AUDIT generated" - a
 * summary of a summary, adding nothing.
 *
 * Method: shingle every report sentence (n-word windows over lowercased
 * alphanumeric tokens) and measure what fraction of each sentence's shingles
 * already exist in the corpus - the string values of every tool result in the
 * transcript, plus any --against document (an upstream report the deliverable
 * was supposed to go beyond). A sentence >= --sentence-threshold overlap is
 * restated; a run with more than --max-restated of its eligible sentences
 * restated fails. Fenced blocks are exempt exhibits (see evals/README.md).
 *
 * Usage:
 *   node restatement-check.mjs --transcript <run.jsonl> --report <report.md>
 *        [--against <file>]... [--shingle 6] [--sentence-threshold 0.6]
 *        [--max-restated 0.35] [--json]
 *
 * Exit: 0 clean, 1 restated, 2 usage/input error.
 */
import fs from 'node:fs';
import process from 'node:process';
import { readTranscript, buildCorpus } from '../lib/transcript.mjs';
import { sentences, shingleSet, stripFences, tokenize } from '../lib/text.mjs';

function parseArgs(argv) {
  const args = { against: [], shingle: 6, sentenceThreshold: 0.6, maxRestated: 0.35, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--transcript') args.transcript = argv[++i];
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--against') args.against.push(argv[++i]);
    else if (a === '--shingle') args.shingle = Number(argv[++i]);
    else if (a === '--sentence-threshold') args.sentenceThreshold = Number(argv[++i]);
    else if (a === '--max-restated') args.maxRestated = Number(argv[++i]);
    else if (a === '--json') args.json = true;
    else {
      console.error(`restatement-check: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!args.transcript || !args.report) {
    console.error('usage: restatement-check.mjs --transcript <run.jsonl> --report <report.md> [--against <file>]... [--shingle N] [--sentence-threshold F] [--max-restated F] [--json]');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

let corpusText;
let reportText;
try {
  const calls = readTranscript(args.transcript);
  corpusText = buildCorpus(calls).text;
  for (const f of args.against) corpusText += `\n${fs.readFileSync(f, 'utf8')}`;
  reportText = stripFences(fs.readFileSync(args.report, 'utf8'));
} catch (err) {
  console.error(`restatement-check: ${err.message}`);
  process.exit(2);
}

const n = args.shingle;
const corpusShingles = shingleSet(tokenize(corpusText), n);
const minTokens = Math.max(n, 8);

const rows = [];
for (const sentence of sentences(reportText)) {
  const toks = tokenize(sentence);
  if (toks.length < minTokens) continue; // too short to judge honestly
  const sh = shingleSet(toks, n);
  let hit = 0;
  for (const s of sh) if (corpusShingles.has(s)) hit += 1;
  const overlap = sh.size === 0 ? 0 : hit / sh.size;
  rows.push({ sentence, overlap, restated: overlap >= args.sentenceThreshold, verbatim: overlap >= 0.9 });
}

const eligible = rows.length;
const restated = rows.filter((r) => r.restated);
const fraction = eligible === 0 ? 0 : restated.length / eligible;
const fail = eligible > 0 && fraction > args.maxRestated;

if (args.json) {
  console.log(JSON.stringify({ eligible, restated: restated.length, fraction: Number(fraction.toFixed(3)), fail, flagged: restated.map((r) => ({ overlap: Number(r.overlap.toFixed(2)), verbatim: r.verbatim, sentence: r.sentence.slice(0, 200) })) }, null, 2));
} else {
  console.log(`restatement-check: ${eligible} eligible sentences, ${restated.length} restated (${(fraction * 100).toFixed(0)}%), threshold ${(args.maxRestated * 100).toFixed(0)}%`);
  if (eligible === 0) console.log('  note: no sentence long enough to judge - vacuous pass');
  for (const r of restated) console.log(`  x ${r.verbatim ? 'VERBATIM' : 'restated'} (${(r.overlap * 100).toFixed(0)}%): ${r.sentence.slice(0, 160)}`);
  console.log(fail ? 'FAIL: the deliverable restates its inputs instead of synthesizing' : 'PASS: the prose goes beyond its inputs');
}
process.exit(fail ? 1 : 0);
