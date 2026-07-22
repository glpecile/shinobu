import { httpFetch } from '@/lib/http/client';
import type { HttpFetch } from '@/lib/http/types';
import { SERIALIZD_UPSTREAM_BASE_URL } from './config';
import { withSerializdAppHeaders } from './transport-headers';

/**
 * Native transport (KTD4): reach the upstream host directly over nitro-fetch,
 * which attaches the app headers per request. Off-browser there is no CORS wall,
 * so the headers alone unlock the API. `state/queries/serializd.ts` assembles
 * `SerializdDeps` from these — provider modules never branch on platform.
 */
export const serializdBaseUrl = SERIALIZD_UPSTREAM_BASE_URL;

export const serializdFetch: HttpFetch = withSerializdAppHeaders(httpFetch);
