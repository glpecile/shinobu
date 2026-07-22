import type { HttpFetch } from '@/lib/http/types';
import { SERIALIZD_APP_HEADERS } from './config';

/** Normalize any `HeadersInit` the caller passed into a plain record. */
function toRecord(headers?: HeadersInit): Record<string, string> {
  if (headers == null) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

/**
 * Wrap a base fetch so every Serializd request carries the three app headers
 * (`Origin`/`Referer`/`X-Requested-With`) the API demands off-browser (KTD4).
 * Only the native transport uses this — on web the browser forbids setting
 * `Origin`/`Referer`, so the same-origin proxy attaches them server-side.
 * Caller-set headers (`Content-Type`, `Authorization`) are preserved.
 *
 * Kept free of any client import so it stays unit-testable without pulling the
 * native nitro-fetch module.
 */
export function withSerializdAppHeaders(baseFetch: HttpFetch): HttpFetch {
  return (input, init) =>
    baseFetch(input, {
      ...init,
      headers: { ...SERIALIZD_APP_HEADERS, ...toRecord(init?.headers) },
    });
}
