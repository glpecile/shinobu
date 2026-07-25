// Probes every provider URL the app depends on — setup pages users are sent
// to and OAuth/API endpoints — and fails if any stopped answering the way a
// live endpoint does. Run by .github/workflows/link-health.yml on a schedule
// (URL rot is time-driven, not diff-driven) and locally via `bun check:links`.
//
// The failure mode this exists to catch: in July 2026 Trakt's app-creation
// page (trakt.tv/oauth/applications) started 301-redirecting into a 404
// (docs/solutions/trakt-oauth-setup.md). A dead setup link strands every new
// user of that provider.
//
// URLs are imported from the same modules the app uses, so this can never
// drift into testing different URLs than the ones shipped. Those modules must
// stay free of react-native imports — plain bun can't parse RN's entry point.

import {
  ANILIST_AUTHORIZE_URL,
  ANILIST_CREATE_CLIENT_URL,
  TMDB_API_SETTINGS_URL,
  TRAKT_CREATE_APP_URL,
} from '@/lib/providers/external-urls';
import { ANILIST_GRAPHQL_URL } from '@/lib/providers/anilist/http';
import {
  TRAKT_API_BASE_URL,
  TRAKT_AUTHORIZE_URL,
} from '@/lib/providers/trakt/config';

export interface UrlCheck {
  name: string;
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  /**
   * Statuses (after following redirects) that prove the endpoint is alive.
   * Error statuses like 400 are deliberate for endpoints probed with dummy
   * credentials — a 400 means "exists and parsed the request"; only an
   * unexpected status (404 after a redirect chain, 5xx, a moved page) fails.
   */
  expect: number[];
}

export const URL_CHECKS: UrlCheck[] = [
  { name: 'Trakt create-app page', url: TRAKT_CREATE_APP_URL, expect: [200] },
  {
    name: 'Trakt authorize endpoint',
    url: `${TRAKT_AUTHORIZE_URL}?response_type=code&client_id=x&redirect_uri=shinobu://redirect`,
    expect: [200, 400],
  },
  {
    name: 'Trakt token endpoint',
    url: `${TRAKT_API_BASE_URL}/oauth/token`,
    method: 'POST',
    body: '{}',
    expect: [400, 401],
  },
  {
    name: 'AniList create-client page',
    url: ANILIST_CREATE_CLIENT_URL,
    expect: [200],
  },
  {
    name: 'AniList authorize endpoint',
    url: `${ANILIST_AUTHORIZE_URL}?client_id=1&response_type=token`,
    expect: [200, 400],
  },
  {
    name: 'AniList GraphQL endpoint',
    url: ANILIST_GRAPHQL_URL,
    method: 'POST',
    body: '{}',
    expect: [400],
  },
  {
    // Signed-out visitors are redirected to the login page (200 either way) —
    // this only has to prove the settings page users are sent to still exists.
    name: 'TMDB API settings page',
    url: TMDB_API_SETTINGS_URL,
    expect: [200],
  },
];

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 15_000;

async function probe(check: UrlCheck): Promise<number> {
  const response = await fetch(check.url, {
    method: check.method ?? 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'user-agent': 'shinobu-link-health',
      ...(check.body != null ? { 'content-type': 'application/json' } : {}),
    },
    ...(check.body != null ? { body: check.body } : {}),
  });
  return response.status;
}

/** Returns an error description, or null when the check passes. */
export async function runCheck(check: UrlCheck): Promise<string | null> {
  let lastFailure = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const status = await probe(check);
      if (check.expect.includes(status)) return null;
      lastFailure = `got ${status}, expected ${check.expect.join('/')}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) await Bun.sleep(RETRY_DELAY_MS);
  }
  return lastFailure;
}

if (import.meta.main) {
  const results = await Promise.all(
    URL_CHECKS.map(async (check) => ({
      check,
      failure: await runCheck(check),
    })),
  );

  let failed = 0;
  for (const { check, failure } of results) {
    if (failure == null) {
      console.log(`ok      ${check.name} — ${check.url}`);
    } else {
      failed += 1;
      console.error(`FAILED  ${check.name} — ${check.url}\n        ${failure}`);
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} external URL(s) look dead or moved. Update the constants ` +
        'in src/lib/providers and record the migration in docs/solutions/.',
    );
    process.exit(1);
  }
  console.log(`\nAll ${results.length} external URLs healthy.`);
}
