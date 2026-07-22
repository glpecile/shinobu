import { httpFetch } from '@/lib/http/client';
import type { HttpFetch } from '@/lib/http/types';
import { SERIALIZD_WEB_PROXY_BASE_URL } from './config';

/**
 * Web transport (KTD4/R13): hit the same-origin `/api/serializd` proxy with
 * plain fetch — the browser forbids setting `Origin`/`Referer`, so the Worker
 * proxy adds the app headers server-side and forwards only `Authorization`. No
 * `EXPO_OS` gate anywhere: reads and writes work on web through the proxy, so
 * the Letterboxd-style native-only gate is deliberately NOT copied.
 */
export const serializdBaseUrl = SERIALIZD_WEB_PROXY_BASE_URL;

export const serializdFetch: HttpFetch = httpFetch;
