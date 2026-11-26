import {
  ANILIST_AUTHORIZE_URL,
  ANILIST_CREATE_CLIENT_URL,
  anilistStaffUrl,
  anilistStudioUrl,
  letterboxdStudioUrl,
  SIMKL_CREATE_APP_URL,
  TMDB_API_SETTINGS_URL,
  TAMPERMONKEY_URL,
  TRAKT_CREATE_APP_URL,
} from '@/lib/providers/external-urls';
import { ANILIST_GRAPHQL_URL } from '@/lib/providers/anilist/http';
import { TRAKT_API_BASE_URL, TRAKT_AUTHORIZE_URL } from '@/lib/providers/trakt/config';

export interface UrlCheck {
  name: string;
  url: string;
  method?: 'GET' | 'POST';
  body?: string;
  expect: number[];
  alive?: RegExp;
}

export const URL_CHECKS: UrlCheck[] = [
  { name: 'Tampermonkey install page', url: TAMPERMONKEY_URL, expect: [200] },
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
    name: 'Simkl create-app page',
    url: SIMKL_CREATE_APP_URL,
    expect: [200],
  },
  {
    name: 'AniList authorize endpoint',
    url: `${ANILIST_AUTHORIZE_URL}?client_id=1&response_type=token`,
    expect: [200, 400],
  },
  {
    // GET returns 404 with the "Use POST" hint even when POST returns 403 during outages (docs/solutions/anilist-api-outage-403.md).
    name: 'AniList GraphQL endpoint',
    url: ANILIST_GRAPHQL_URL,
    expect: [404],
    alive: /Use POST request to access graphql subdomain/i,
  },
  {
    // Signed-out TMDB answers 401 here instead of redirecting to login.
    name: 'TMDB API settings page',
    url: TMDB_API_SETTINGS_URL,
    expect: [200, 401],
  },
  {
    name: 'AniList staff page',
    url: anilistStaffUrl(96_879),
    expect: [200],
  },
  {
    name: 'AniList studio page',
    url: anilistStudioUrl(21),
    expect: [200],
  },
  {
    name: 'Letterboxd studio page',
    url: letterboxdStudioUrl('A24') ?? 'https://letterboxd.com/studio/a24/',
    expect: [200],
  },
];

const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 15_000;

async function probe(check: UrlCheck): Promise<{ status: number; body: string }> {
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
  const body = check.alive == null ? '' : (await response.text()).slice(0, 2_000);
  return { status: response.status, body };
}

export async function runCheck(check: UrlCheck): Promise<string | null> {
  let last = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const { status, body } = await probe(check);
      if (!check.expect.includes(status)) {
        last = `got ${status}, expected ${check.expect.join('/')}`;
      } else if (check.alive != null && !check.alive.test(body)) {
        last = `got ${status} but the body no longer matches ${check.alive}`;
      } else {
        return null;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) await Bun.sleep(RETRY_DELAY_MS);
  }
  return last;
}

if (import.meta.main) {
  const results = await Promise.all(
    URL_CHECKS.map(async (check) => ({
      check,
      failure: await runCheck(check),
    })),
  );

  let rotted = 0;
  for (const { check, failure } of results) {
    if (failure == null) {
      console.log(`ok      ${check.name} — ${check.url}`);
    } else {
      rotted += 1;
      console.error(`FAILED  ${check.name} — ${check.url}\n        ${failure}`);
    }
  }

  if (rotted > 0) {
    console.error(
      `\n${rotted} external URL(s) look dead or moved. Update the constants ` +
        'in src/lib/providers and record the migration in docs/solutions/.',
    );
    process.exit(1);
  }
  console.log(`\nAll ${results.length} external URLs healthy.`);
}
