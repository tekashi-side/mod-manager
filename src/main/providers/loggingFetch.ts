import pc from 'picocolors';
import type { FetchLike } from './githubReleases';

// Future-proofing: there is no auth header today, but never print one if it is
// ever added (e.g. an authenticated GitHub request for a higher rate limit).
const SENSITIVE = /^(authorization|cookie|set-cookie|.*(token|secret|key).*)$/i;

/** Color an HTTP status by class (2xx ok, 304 reused-cache, 4xx warn, 5xx error). */
const colorStatus = (status: number, text: string): string => {
  if (status === 304) return pc.cyan(text);
  if (status >= 500) return pc.red(text);
  if (status >= 400) return pc.yellow(text);
  if (status >= 200 && status < 300) return pc.green(text);
  return text;
};

/**
 * Color the `remaining/limit` rate-limit pair by how much budget is left. CDN
 * responses carry no rate-limit header, so their `-/-` stays dim (not counted).
 */
const colorRateLimit = (remaining: string | null, limit: string | null): string => {
  const text = `${remaining ?? '-'}/${limit ?? '-'}`;
  const left = remaining === null ? Number.NaN : Number(remaining);
  if (!Number.isFinite(left)) return pc.dim(text);
  if (left <= 10) return pc.red(text);
  if (left <= 25) return pc.yellow(text);
  return pc.green(text);
};

/** Normalize any headers init (object | array | Headers) to a readable, redacted block. */
const dumpHeaders = (headers: RequestInit['headers']): string => {
  const lines = [...new Headers(headers)].map(
    ([key, value]) => `${key}: ${SENSITIVE.test(key) ? '<redacted>' : value}`,
  );
  return lines.length ? `\n    ${pc.dim(lines.join('\n    '))}` : pc.dim(' (none)');
};

export interface LoggingFetchOptions {
  /** Also log the (redacted) request and response headers. */
  verbose?: boolean;
  /** The underlying fetch to delegate to (defaults to the global `fetch`). */
  inner?: FetchLike;
}

/**
 * Wrap a `FetchLike` so each request logs its method, URL, status, `ETag`, and
 * remaining rate-limit quota to the main-process stdout (the `npm run dev`
 * terminal) — the only place main-process network activity is visible, since it
 * never reaches the renderer DevTools Network tab.
 *
 * It reads headers only and returns the `Response` untouched — it never consumes
 * the body (`.json()`/`.text()`/`.body`), so streamed `.it` downloads are safe.
 * Note the logged duration is time-to-Response (headers), not full transfer time,
 * because bodies are streamed later by the downloader.
 */
export const createLoggingFetch = (options: LoggingFetchOptions = {}): FetchLike => {
  const inner = options.inner ?? fetch;
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const started = Date.now();
    const res = await inner(input, init);
    const ms = Date.now() - started;
    const status = colorStatus(res.status, `${res.status} ${res.statusText}`);
    const rateLimit = colorRateLimit(
      res.headers.get('x-ratelimit-remaining'),
      res.headers.get('x-ratelimit-limit'),
    );
    console.log(
      `${pc.cyan('[net]')} ${pc.bold(init?.method ?? 'GET')} ${url} ${pc.dim('->')} ${status}` +
        ` ${pc.dim(`(${ms}ms)`)} ${pc.dim(`etag=${res.headers.get('etag') ?? '-'}`)}` +
        ` ${pc.dim('ratelimit=')}${rateLimit}`,
    );
    if (options.verbose) {
      console.log(
        `${pc.cyan('[net]')}   ${pc.dim('request headers:')}${dumpHeaders(init?.headers)}`,
      );
      console.log(
        `${pc.cyan('[net]')}   ${pc.dim('response headers:')}${dumpHeaders(res.headers)}`,
      );
    }
    return res;
  };
};
