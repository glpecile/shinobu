/**
 * U10 — Serializd watched/watchlisted mutual-exclusivity probe
 * (plan 0031, KTD-10 named risk, stop-condition (c)).
 *
 * The sibling of `worker/letterboxd-write-spike.ts`: a **standing harness**, not
 * a one-off. It exists because KTD-10's whole guard rests on an inference from
 * Serializd's product copy — that a show cannot be watchlisted and watched at
 * once — and shipping a data-loss guard against an inference is how a data
 * contract rots. This turns it into a recorded fact.
 *
 * It is account-bound and cannot run in CI: it needs a real token and a real
 * show whose watched state you are willing to lose.
 *
 * ## Running it
 *
 * ```
 * # Read-only by default — captures bodies, writes nothing.
 * SERIALIZD_EMAIL=… SERIALIZD_PASSWORD=… bun scripts/serializd-watchlist-spike.ts --tmdb 1396
 *
 * # Or with a token you already have (skips the login POST):
 * SERIALIZD_TOKEN=… SERIALIZD_USERNAME=… bun scripts/serializd-watchlist-spike.ts --tmdb 1396
 *
 * # Steps 2–3: the *safe* write — S2's id only, S1 must survive.
 * … --tmdb 1396 --write
 *
 * # Steps 4–6: the destructive cases. Only on a throwaway show.
 * … --tmdb 1396 --write --destructive
 * ```
 *
 * Output is a markdown report on stdout, ready to land at
 * `docs/solutions/serializd-watchlist-clears-watched.md` — which is the actual
 * deliverable, per AGENTS.md § Compound Knowledge. Pipe it:
 * `… > docs/solutions/serializd-watchlist-clears-watched.md`.
 *
 * ## Preparing the account (do this first, by hand, on serializd.com)
 *
 * Pick a show with **at least two regular seasons** that you do not care about.
 * Mark **season 1 watched using the site's season-level control** — not
 * episode-by-episode. That distinction is a stated precondition of
 * stop-condition (c): if a wholesale-marked season is absent from `/progress`'s
 * `watchedSeasons`, the guard has no input that can see it and fails *open*,
 * which is worse than the hazard it guards. Step 1 checks exactly that and
 * refuses to continue if it doesn't hold.
 *
 * ## Reading the result
 *
 * - (3) preserves S1 and (4) destroys it → KTD-10's filter is exactly right;
 *   flip `watchlistWrite` to `'write'` in `registry.ts`.
 * - (3) *also* destroys S1 → the API clears at show level regardless of
 *   `season_ids`; the filter protects nothing, **stop-condition (c) fires**, and
 *   Serializd stays `'manual'`.
 * - neither destroys anything → keep the filter anyway (it still produces the
 *   honest "already watched" skip rather than a silent `ok`) and record that the
 *   exclusivity is a UI convention, not an API one.
 *
 * No RN/Expo imports here, deliberately — this runs under plain bun, so it
 * shares only the header/base constants the Worker also shares (KTD4).
 */
import {
  SERIALIZD_APP_HEADERS,
  SERIALIZD_UPSTREAM_BASE_URL,
} from '@/lib/providers/serializd/config';

interface Args {
  tmdb: number;
  write: boolean;
  destructive: boolean;
}

function parseArgs(argv: string[]): Args {
  const tmdbIndex = argv.indexOf('--tmdb');
  const tmdb = tmdbIndex === -1 ? Number.NaN : Number(argv[tmdbIndex + 1]);
  if (!Number.isInteger(tmdb)) {
    throw new Error('Pass the throwaway show as `--tmdb <tmdbId>`.');
  }
  return {
    tmdb,
    write: argv.includes('--write'),
    destructive: argv.includes('--destructive'),
  };
}

/** Every request the probe makes, logged verbatim — the report *is* the evidence. */
const log: string[] = [];

function record(heading: string, body: unknown) {
  log.push(`### ${heading}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`);
}

async function call(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${SERIALIZD_UPSTREAM_BASE_URL}/${path}`, {
    ...init,
    headers: {
      ...SERIALIZD_APP_HEADERS,
      'Content-Type': 'application/json',
      ...(token == null ? {} : { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // Non-JSON bodies are themselves a finding (Render cold-start HTML) — keep
    // the text rather than throwing it away.
  }
  return { status: response.status, body };
}

/** `{ [seasonNumber]: watchedEpisodeCount }` — the one shape both diffs compare. */
function watchedShape(progress: unknown): Record<string, number> {
  const seasons =
    (progress as { watchedSeasons?: Array<Record<string, unknown>> } | null)
      ?.watchedSeasons ?? [];
  const shape: Record<string, number> = {};
  for (const season of seasons) {
    const number = season.seasonNumber;
    if (typeof number !== 'number') continue;
    const episodes = season.watchedEpisodes;
    shape[String(number)] = Array.isArray(episodes) ? episodes.length : 0;
  }
  return shape;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --- auth -----------------------------------------------------------------
  let token = process.env.SERIALIZD_TOKEN ?? null;
  let username = process.env.SERIALIZD_USERNAME ?? null;
  if (token == null) {
    const email = process.env.SERIALIZD_EMAIL;
    const password = process.env.SERIALIZD_PASSWORD;
    if (email == null || password == null) {
      throw new Error(
        'Set SERIALIZD_TOKEN (+ SERIALIZD_USERNAME), or SERIALIZD_EMAIL + SERIALIZD_PASSWORD.',
      );
    }
    const login = await call('login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const raw = login.body as { token?: string; username?: string; user?: { username?: string } };
    if (raw?.token == null) {
      throw new Error(`Login failed (${login.status}). Body withheld — it may carry a token.`);
    }
    token = raw.token;
    username = username ?? raw.username ?? raw.user?.username ?? null;
    // The login body is deliberately **never** recorded: it carries the bearer
    // token, and this report is meant to be committed.
    log.push(`### Auth\n\nLogged in as \`${username ?? '(username not in response)'}\`.\n`);
  }
  if (username == null) {
    throw new Error('SERIALIZD_USERNAME is required to read the progress endpoint.');
  }

  // --- step 0: the show body ------------------------------------------------
  // U9's season enumeration and KTD-10's `seasonNumber` ↔ `id` join both assume
  // this body carries per-season `id` and `episodeCount`. If it doesn't, the
  // 2 + N `resolveSeasonId` fallback is chosen here or not at all.
  const show = await call(`show/${args.tmdb}`, token);
  record(`Step 0 — \`GET show/${args.tmdb}\` (verbatim)`, show);

  const seasons =
    (show.body as { seasons?: Array<{ id?: number; seasonNumber?: number; episodeCount?: number }> })
      ?.seasons ?? [];
  const regular = seasons.filter(
    (season) =>
      typeof season.seasonNumber === 'number' &&
      season.seasonNumber > 0 &&
      typeof season.id === 'number',
  );
  log.push(
    `**Per-season \`id\` present:** ${regular.length > 0 ? 'yes' : '**NO — the 2 + N `resolveSeasonId` fallback is required**'}\n`,
    `**Per-season \`episodeCount\` present:** ${regular.some((s) => typeof s.episodeCount === 'number') ? 'yes' : '**no**'}\n`,
  );
  const s1 = regular.find((season) => season.seasonNumber === 1);
  const s2 = regular.find((season) => season.seasonNumber === 2);
  const specials = seasons.find((season) => season.seasonNumber === 0);

  // --- step 1: the precondition --------------------------------------------
  const progressPath = `user/${username}/show/${args.tmdb}/progress`;
  const before = await call(progressPath, token);
  record(`Step 1 — \`GET ${progressPath}\` after marking S1 watched wholesale (verbatim)`, before);

  const beforeShape = watchedShape(before.body);
  const s1Visible = Object.hasOwn(beforeShape, '1');
  log.push(
    `**Precondition — a wholesale-marked season is visible in \`/progress\`:** ${
      s1Visible
        ? `yes (\`watchedSeasons[1]\` has ${beforeShape['1']} episode entries)`
        : '**NO — the guard has no input that can see it and fails OPEN. Stop-condition (c) fires on this alone.**'
    }\n`,
  );

  if (!args.write) {
    log.push(
      '\n> Read-only run. Re-run with `--write` for steps 2–3, and `--write --destructive` for 4–6.\n',
    );
    console.log(report(args, log));
    return;
  }
  if (!s1Visible) {
    log.push('\n> **Stopped before writing.** The precondition failed; no POST was issued.\n');
    console.log(report(args, log));
    return;
  }
  if (s1 == null || s2 == null) {
    log.push('\n> **Stopped before writing.** Need two regular seasons with ids on this show.\n');
    console.log(report(args, log));
    return;
  }

  // --- steps 2–3: the safe write, which the shipped filter actually performs -
  const safeAdd = await call('watchlist_v2', token, {
    method: 'POST',
    body: JSON.stringify({ showId: args.tmdb, season_ids: [s2.id] }),
  });
  record(`Step 2 — \`POST watchlist_v2\` with **S2's id only** (\`${s2.id}\`)`, safeAdd);

  const afterSafe = await call(progressPath, token);
  const afterSafeShape = watchedShape(afterSafe.body);
  record('Step 3 — progress after the safe write', {
    before: beforeShape,
    after: afterSafeShape,
    s1Survived: Object.hasOwn(afterSafeShape, '1'),
  });
  log.push(
    `**S1 survived a watchlist write that excluded it:** ${
      Object.hasOwn(afterSafeShape, '1')
        ? 'yes — the filter protects what it claims to'
        : '**NO — the API clears at show level regardless of `season_ids`. STOP-CONDITION (c) FIRES: the filter protects nothing.**'
    }\n`,
  );

  if (!args.destructive) {
    log.push('\n> Stopped before the destructive cases. Re-run with `--destructive` for 4–6.\n');
    console.log(report(args, log));
    return;
  }

  // --- step 4: the destructive case, observed rather than inferred ----------
  const unsafeAdd = await call('watchlist_v2', token, {
    method: 'POST',
    body: JSON.stringify({ showId: args.tmdb, season_ids: [s1.id, s2.id] }),
  });
  record(`Step 4 — \`POST watchlist_v2\` with **S1 included** (\`${s1.id}\`)`, unsafeAdd);

  const afterUnsafe = await call(progressPath, token);
  const afterUnsafeShape = watchedShape(afterUnsafe.body);
  record('Step 4b — progress after including S1', {
    before: beforeShape,
    after: afterUnsafeShape,
    s1Survived: Object.hasOwn(afterUnsafeShape, '1'),
  });
  log.push(
    `**Including a watched season destroyed its watched state:** ${
      Object.hasOwn(afterUnsafeShape, '1')
        ? 'no — the exclusivity is a UI convention, not an API one. Keep the filter anyway (it produces the honest "already watched" skip).'
        : '**yes — KTD-10 is a real hazard and the filter is exactly right.**'
    }\n`,
  );

  // --- step 5: the remove path, R34's named risk ---------------------------
  // Re-mark S1 by hand before trusting this one if step 4 cleared it.
  const remove = await call('watchlist/remove_v2', token, {
    method: 'POST',
    body: JSON.stringify({ showId: args.tmdb, season_ids: [s1.id] }),
  });
  record(`Step 5 — \`POST watchlist/remove_v2\` with **S1 included** (\`${s1.id}\`)`, remove);
  record('Step 5b — progress after the remove', watchedShape((await call(progressPath, token)).body));

  // --- step 6: what a specials id does -------------------------------------
  // Decides whether one ineligible id can fail an otherwise-valid add.
  if (specials?.id != null) {
    const specialsAdd = await call('watchlist_v2', token, {
      method: 'POST',
      body: JSON.stringify({ showId: args.tmdb, season_ids: [specials.id] }),
    });
    record(`Step 6 — \`POST watchlist_v2\` with the **specials** id (\`${specials.id}\`)`, specialsAdd);
  } else {
    log.push('### Step 6 — specials\n\nThis show has no season 0; probe it on one that does.\n');
  }

  console.log(report(args, log));
}

function report(args: Args, body: string[]): string {
  return [
    '# Serializd: does a watchlist write clear watched state?',
    '',
    `Probe: \`scripts/serializd-watchlist-spike.ts --tmdb ${args.tmdb}${args.write ? ' --write' : ''}${args.destructive ? ' --destructive' : ''}\`.`,
    'Plan 0031 U10, discharging KTD-10\'s named risk and stop-condition (c).',
    '',
    '> Re-run this harness whenever the Serializd endpoints move (`_v2` → `_v3`)',
    '> or the season-id join stops matching — the finding below is dated, not eternal.',
    '',
    ...body,
    '## Verdict',
    '',
    '<!-- Fill this in from the checks above, then flip (or keep) the registry',
    '     declarations in `src/lib/providers/registry.ts`. That token is the',
    '     single switch, and reverting it is the standing rollback (KTD-9). -->',
    '',
  ].join('\n');
}

await main();
