// Standing Serializd watchlist/watched exclusivity probe (docs/solutions/serializd-watchlist-clears-watched.md).
import {
  SERIALIZD_APP_HEADERS,
  SERIALIZD_UPSTREAM_BASE_URL,
} from '@/lib/providers/serializd/config';

interface Args {
  tmdb: number;
  write: boolean;
  destructive: boolean;
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseArgs(argv: string[]): Args {
  const tmdb = Number(flagValue(argv, '--tmdb') ?? Number.NaN);
  if (!Number.isInteger(tmdb)) {
    throw new Error('Pass the throwaway show as `--tmdb <tmdbId>`.');
  }
  return {
    tmdb,
    write: argv.includes('--write'),
    destructive: argv.includes('--destructive'),
  };
}

interface ListItem {
  showId: number;
  showName: string;
  seasonIds: number[];
}

// Serializd 500s if `sort_by` is omitted.
async function allPages(username: string, list: string): Promise<ListItem[]> {
  const items: ListItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { body } = await call(
      `user/${encodeURIComponent(username)}/${list}/${page}?sort_by=date_added_desc`,
      null,
    );
    const payload = body as { items?: ListItem[]; totalPages?: number };
    items.push(...(payload.items ?? []));
    totalPages = payload.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}

async function exclusivityCheck(username: string) {
  const [watched, watchlisted] = await Promise.all([
    allPages(username, 'watchedpage_v2'),
    allPages(username, 'watchlistpage_v2'),
  ]);
  const watchedById = new Map(watched.map((item) => [item.showId, item]));

  const overlaps: string[] = [];
  for (const listed of watchlisted) {
    const seen = watchedById.get(listed.showId);
    if (seen == null) continue;
    const shared = listed.seasonIds.filter((id) => seen.seasonIds.includes(id));
    if (shared.length === 0) continue;
    overlaps.push(`| ${listed.showId} | ${listed.showName} | ${shared.join(', ')} |`);
  }

  console.log(
    [
      '# Serializd: does a watchlist write clear watched state?',
      '',
      `Read-only exclusivity check for \`${username}\` — no credentials, no writes.`,
      `Watched shows: **${watched.length}** · watchlisted shows: **${watchlisted.length}**.`,
      '',
      overlaps.length > 0
        ? [
            `**${overlaps.length} show(s) hold the same season id in BOTH lists at once.**`,
            'Exclusivity is therefore a UI convention, not an API invariant, and a',
            'watchlist write naming a watched season destroys nothing — KTD-10 is not a',
            'hazard. Stop-condition (c) does not fire.',
            '',
            '| showId | show | season ids in both |',
            '| --- | --- | --- |',
            ...overlaps,
          ].join('\n')
        : [
            '**No overlapping season found.** That is not proof of exclusivity — it may',
            'just mean this account never watchlisted something it had watched. The',
            'question is still open: run the authenticated steps (`--tmdb … --write`,',
            'then `--destructive`) on a throwaway show.',
          ].join('\n'),
      '',
    ].join('\n'),
  );
}

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
    // Serializd on Render can return cold-start HTML; keep raw text.
  }
  return { status: response.status, body };
}

function watchedShape(progress: unknown): Record<string, number> {
  const seasons =
    (progress as { watchedSeasons?: Array<Record<string, unknown>> } | null)?.watchedSeasons ?? [];
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
  const argv = process.argv.slice(2);

  if (argv.includes('--exclusivity')) {
    const username = flagValue(argv, '--user') ?? process.env.SERIALIZD_USERNAME;
    if (username == null) {
      throw new Error('Pass `--user <username>` (or set SERIALIZD_USERNAME).');
    }
    await exclusivityCheck(username);
    return;
  }

  const args = parseArgs(argv);

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
    log.push(`### Auth\n\nLogged in as \`${username ?? '(username not in response)'}\`.\n`);
  }
  if (username == null) {
    throw new Error('SERIALIZD_USERNAME is required to read the progress endpoint.');
  }

  const show = await call(`show/${args.tmdb}`, token);
  record(`Step 0 — \`GET show/${args.tmdb}\` (verbatim)`, show);

  const seasons =
    (
      show.body as {
        seasons?: Array<{ id?: number; seasonNumber?: number; episodeCount?: number }>;
      }
    )?.seasons ?? [];
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

  const progressPath = `user/${username}/show/${args.tmdb}/progress`;
  const before = await call(progressPath, token);
  record(`Step 1 — \`GET ${progressPath}\` after marking S1 watched wholesale (verbatim)`, before);

  const beforeShape = watchedShape(before.body);
  const s1Visible = Object.hasOwn(beforeShape, '1');
  if (before.status === 404) {
    log.push(
      '**`/progress` responded 404 — the endpoint has been removed from the API.**\n',
      'Every step below that reads it is inert. Run `--exclusivity` instead; it\n',
      'answers the same question from the account-wide lists.\n',
    );
  }
  log.push(
    `**Precondition — a wholesale-marked season is visible in \`/progress\`:** ${
      s1Visible
        ? `yes (\`watchedSeasons[1]\` has ${beforeShape['1']} episode entries)`
        : '**NO — the guard has no input that can see it and fails OPEN.**'
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

  const remove = await call('watchlist/remove_v2', token, {
    method: 'POST',
    body: JSON.stringify({ showId: args.tmdb, season_ids: [s1.id] }),
  });
  record(`Step 5 — \`POST watchlist/remove_v2\` with **S1 included** (\`${s1.id}\`)`, remove);
  record(
    'Step 5b — progress after the remove',
    watchedShape((await call(progressPath, token)).body),
  );

  if (specials?.id != null) {
    const specialsAdd = await call('watchlist_v2', token, {
      method: 'POST',
      body: JSON.stringify({ showId: args.tmdb, season_ids: [specials.id] }),
    });
    record(
      `Step 6 — \`POST watchlist_v2\` with the **specials** id (\`${specials.id}\`)`,
      specialsAdd,
    );
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
    "Plan 0031 U10, discharging KTD-10's named risk and stop-condition (c).",
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
