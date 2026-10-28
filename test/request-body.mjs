/**
 * What core's body parser does with a request the plugin sends (HK-838,
 * lib/upstream.mjs gzipBody): a body sent with Content-Encoding: gzip is inflated,
 * then read as JSON text. For the fake Hiveku servers in these tests, so they
 * read a request the way core reads it. Not a test file itself.
 */
import { gunzipSync } from 'node:zlib';

function isGzip(value) {
  return String(value ?? '').trim().toLowerCase() === 'gzip';
}

/** The text of the body a faked globalThis.fetch was handed. */
export function fetchBodyText(init) {
  const headers = init?.headers ?? {};
  const encoding =
    typeof headers.get === 'function'
      ? headers.get('content-encoding')
      : Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-encoding')?.[1];
  const body = init?.body;
  if (isGzip(encoding)) return gunzipSync(body).toString('utf8');
  return typeof body === 'string' ? body : Buffer.from(body ?? '').toString('utf8');
}

/** The whole text of a request a node:http test server received. */
export function readRequestText(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        resolve((isGzip(req.headers['content-encoding']) ? gunzipSync(raw) : raw).toString('utf8'));
      } catch (err) {
        reject(err);
      }
    });
  });
}
