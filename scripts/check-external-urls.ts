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
  anilistStaffUrl,
  anilistStudioUrl,
  letterboxdStudioUrl,
  SIMKL_CREATE_APP_URL,
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
  /**
   * A body pattern that identifies the provider's own *outage* answer. Still a
   * failure — an outage is something to know about — but reported as one,
   * not as a moved URL with instructions to edit the constants.
   */
  outage?: RegExp;
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
    // Signed-out, Simkl serves the settings shell (200) rather than a
    // redirect-to-login; a moved or dead page would 404.
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
    // During an outage AniList answers 403 with a GraphQL error body — "The
    // AniList API has been temporarily disabled due to severe stability
    // issues" (2026-09-10, docs/solutions/anilist-api-outage-403.md). The
    // check still fails, so the daily run says AniList is down, but as an
    // outage: nothing in the constants needs editing.
    name: 'AniList GraphQL endpoint',
    url: ANILIST_GRAPHQL_URL,
    method: 'POST',
    body: '{}',
    expect: [400],
    outage: /temporarily disabled/i,
  },
  {
    // An account-settings page: signed-out (which this probe always is)
    // TMDB answers 401 rather than redirecting to a login page. That's the
    // "exists and refused me" signal — a moved or dead page would 404. A 200
    // is accepted too, in case TMDB ever starts redirecting instead.
    name: 'TMDB API settings page',
    url: TMDB_API_SETTINGS_URL,
    expect: [200, 401],
  },
  {
    // Plan 0035 R11 replaced a name-search URL with these id-keyed page shapes,
    // so the *shape* is now the thing that can rot. Probed with famously stable
    // ids — Hayao Miyazaki (96879) and Studio Ghibli (21) — because a fixture id
    // that gets deleted would fail this check for a reason that is not the one
    // it exists to catch.
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
    // Best-effort by construction (we hold no Letterboxd studio id), so this
    // probes that the `/studio/{slug}/` shape still exists at all — A24 is as
    // permanent a studio page as Letterboxd has.
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
  // Only the outage match reads the body; a page never needs more than this.
  const body = check.outage == null ? '' : (await response.text()).slice(0, 2_000);
  return { status: response.status, body };
}

export interface CheckFailure {
  /** `rot`: moved/dead URL. `outage`: the provider itself says it is down. */
  kind: 'rot' | 'outage';
  detail: string;
}

/** Returns the failure, or null when the check passes. */
export async function runCheck(check: UrlCheck): Promise<CheckFailure | null> {
  let last: CheckFailure = { kind: 'rot', detail: '' };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const { status, body } = await probe(check);
      if (check.expect.includes(status)) return null;
      const detail = `got ${status}, expected ${check.expect.join('/')}`;
      last =
        check.outage != null && check.outage.test(body)
          ? { kind: 'outage', detail: `${detail} — provider reports an outage: ${body.replace(/\s+/g, " ").trim().slice(0, 160)}` }
          : { kind: 'rot', detail };
    } catch (error) {
      last = { kind: 'rot', detail: error instanceof Error ? error.message : String(error) };
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
  let down = 0;
  for (const { check, failure } of results) {
    if (failure == null) {
      console.log(`ok      ${check.name} — ${check.url}`);
    } else if (failure.kind === 'outage') {
      down += 1;
      console.error(`OUTAGE  ${check.name} — ${check.url}\n        ${failure.detail}`);
    } else {
      rotted += 1;
      console.error(`FAILED  ${check.name} — ${check.url}\n        ${failure.detail}`);
    }
  }

  if (rotted > 0) {
    console.error(
      `\n${rotted} external URL(s) look dead or moved. Update the constants ` +
        'in src/lib/providers and record the migration in docs/solutions/.',
    );
  }
  if (down > 0) {
    console.error(
      `\n${down} provider(s) report an outage. Nothing to update — the URL is ` +
        'right and the provider is down; re-run once it recovers.',
    );
  }
  if (rotted > 0 || down > 0) process.exit(1);
  console.log(`\nAll ${results.length} external URLs healthy.`);
}
