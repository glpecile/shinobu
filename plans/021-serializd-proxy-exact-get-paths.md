# Plan 021: The Serializd proxy forwards only the GET paths and query keys the app uses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- worker/serializd-proxy.ts worker/serializd-proxy.test.ts src/lib/providers/serializd`
> If any of these changed since this plan was written, re-run the call-site
> inventory in step 1 and compare it against the table below; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED (an over-narrow rule breaks a Serializd read on web)
- **Depends on**: none
- **Category**: security (proxy allowlist)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

`worker/serializd-proxy.ts` is one of three approved Cloudflare Worker
exceptions (AGENTS.md "Web and CORS"). Its header promises it "forwards ONLY
an allowlisted set of Serializd path+method pairs". Every POST rule and the
list and upcoming GETs are exact, but two GET rules are open prefixes:
`p.startsWith('show/')` and `p.startsWith('user/')`. They forward **any**
sub-path, including percent-encoded segments such as `%2F` that the
traversal check doesn't catch, and every rule forwards the caller's whole query
string upstream. Requests carry the server-side app headers, so the relay can
reach Serializd GET endpoints well beyond what Shinobu needs.

The impact is bounded: a cross-site page can't attach a user's
`Authorization`, and only the Serializd host is reachable. This plan closes the
gap the header already claims is closed. It also checks `Content-Length`
before buffering a POST body, so an oversized body is rejected without being read.

## Current state

`worker/serializd-proxy.ts` (relevant parts):

```ts
const RULES: Array<{ match: (path: string) => boolean; method: Method }> = [
  { match: (p) => p === 'login', method: 'POST' },
  ...
  { match: (p) => /^list\/[1-9][0-9]{0,14}$/.test(p), method: 'GET' },
  { match: (p) => p === 'search/upcoming_episodes_v3', method: 'GET' },
  { match: (p) => p.startsWith('show/'), method: 'GET' },
  { match: (p) => p.startsWith('user/'), method: 'GET' },
];
...
  let body: ArrayBuffer | undefined;
  if (method === 'POST') {
    body = await request.arrayBuffer();
    if (body.byteLength > (subPath === 'list/edit' ? MAX_LIST_EDIT_BYTES : MAX_BODY_BYTES)) return jsonError(413, 'request too large');
  }
  ...
  const upstreamUrl = `${SERIALIZD_UPSTREAM_BASE_URL}/${subPath}${url.search}`;
```

Read the whole file header comment before editing (AGENTS.md: "read the invariants in each file's header before editing it").

Client GET call sites today (from `src/lib/providers/serializd/*.ts`):

| File | Path (relative to base) | Query keys |
|---|---|---|
| `show.ts:44` | `show/{tmdbId}` | none |
| `season-id.ts:37` | `show/{tmdbId}/season/{seasonNumber}` | none |
| `diary.ts:54` | `user/{username}/diary` | `page` |
| `lists.ts:117` | `user/{username}/lists` or `user/{username}/liked_lists` | `sort_by`, `page` |
| `progress.ts:35` | `user/{username}/show/{tmdbId}/progress` | none |
| `watched.ts:34` | `user/{username}/watchedpage_v2/{page}` | `sort_by` |
| (existing exact rules) `list/{id}`, `search/upcoming_episodes_v3` | | check each call site for query keys |

`{username}` is built with `encodeURIComponent`. `show.ts:35` also mentions
`show/` in a comment; confirm it isn't a second call.

Tests: `worker/serializd-proxy.test.ts` has helpers `proxyRequest(path, init)`
and `capturingUpstream(response)` (records `captured` calls). It includes
`'unlisted paths and traversal tricks are 404, never forwarded'`, which loops
over paths and methods. A long comment there explains that `../` dot segments
are resolved by the URL parser **before** the handler. Only percent-encoded
traversal reaches the rules. Keep that comment accurate.

## Commands you will need

| Purpose   | Command                                     | Expected on success |
|-----------|---------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`             | exit 0              |
| One file  | `bun test worker/serializd-proxy.test.ts`   | all pass            |
| Typecheck | `bun typecheck`                             | exit 0              |
| All tests | `bun run test`                              | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                  | exit 0              |

## Scope

**In scope**: `worker/serializd-proxy.ts`, `worker/serializd-proxy.test.ts`.

**Out of scope**: the POST rules (already exact), the Letterboxd and 4chan
proxies, rate limiting (needs a Cloudflare binding and an owner decision),
and the client modules under `src/lib/providers/serializd/`.

## Git workflow

- Branch: `security/serializd-proxy-exact-gets`
- One commit: `fix(worker): replace Serializd GET prefixes with exact paths`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-inventory call sites

Run `grep -rnE "serializdHttp|serializdFetch" src/lib/providers/serializd --include=*.ts | grep -v test`
and read each GET call. Confirm the table above, including the query keys
used by `list/{id}` and `search/upcoming_episodes_v3`. Write the final table
into your report.

**Verify**: every GET call site maps to exactly one row.

### Step 2: Exact GET rules with per-rule query keys

Give each rule an optional `query: readonly string[]` (allowed query keys;
default none). Replace the two prefix rules with anchored regexes. Use one
`SEGMENT` pattern for a username: one path segment of unreserved characters or
percent-escapes, excluding encoded `/`, `\` and `.`:

```ts
// One encoded path segment: no raw or encoded slash/backslash, never "." or "..".
const SEGMENT = String.raw`(?:[A-Za-z0-9_.~-]|%(?!2[Ff]|5[Cc]|2[Ee])[0-9A-Fa-f]{2})+`;
const ID = '[1-9][0-9]{0,14}';
```

Rules (GET):
- `^show/${ID}$`
- `^show/${ID}/season/(?:0|${ID})$`. Season 0 (specials) exists. Confirm in `season-id.ts` whether 0 can be sent.
- `^user/${SEGMENT}/diary$`, query `['page']`
- `^user/${SEGMENT}/(?:lists|liked_lists)$`, query `['sort_by', 'page']`
- `^user/${SEGMENT}/show/${ID}/progress$`
- `^user/${SEGMENT}/watchedpage_v2/${ID}$`, query `['sort_by']`
- keep `list/{id}` and `search/upcoming_episodes_v3`, adding their query keys from step 1.

Because `SEGMENT` allows `.` characters, also reject a segment that is exactly
`.` or `..` (`isUnsafePath` already rejects any `..` substring, which covers it).

After matching a rule, reject the request with 400 `{"error":"query not allowed"}`
if `url.searchParams` has any key outside `rule.query`. Forward
`url.search` unchanged when it passes.

Update the file header and the `RULES` docblock: GETs are now exact paths, and
query keys are allowlisted per rule.

**Verify**: `bun typecheck` → exit 0.

### Step 3: Size check before buffering

Before `await request.arrayBuffer()`, add:

```ts
    const limit = subPath === 'list/edit' ? MAX_LIST_EDIT_BYTES : MAX_BODY_BYTES;
    const declared = Number(request.headers.get('Content-Length') ?? NaN);
    if (Number.isFinite(declared) && declared > limit) return jsonError(413, 'request too large');
```

Keep the existing post-read `byteLength` check: `Content-Length` can be absent or wrong.

**Verify**: `bun test worker/serializd-proxy.test.ts` → existing tests pass.

### Step 4: Tests

- Extend the existing `'unlisted paths and traversal tricks are 404, never forwarded'`
  path list (don't add a parallel test) with:
  `'/api/serializd/show/12/cast'`, `'/api/serializd/show/abc'`,
  `'/api/serializd/user/gian/admin'`, `'/api/serializd/user/gian%2F..%2Flogin/diary'`,
  `'/api/serializd/user/gian/show/1/progress/extra'`.
- If no test already forwards each client GET shape, add **one** table test
  (`test.each`) that sends each row of the step 1 table (with its allowed
  query) and expects a forwarded call with the same path and query.
- Add one case: `GET /api/serializd/show/12?x=1` → 400, not forwarded.
- Add one case: a POST to `/api/serializd/login` with header
  `Content-Length: 70000` and a small actual body → 413, not forwarded.

**Verify**: `bun test worker/serializd-proxy.test.ts` → all pass.

### Step 5: Web smoke (if you can run a browser)

`bun web` plus `bun run dev:worker`, signed in to Serializd on web. Open the
Diary (Serializd entries), a TV show's details (season list), and the Serializd
lists on Home. The Network tab must show no 404/400 from `/api/serializd/`.

**Verify**: describe the result, or say a browser or account wasn't available.

## Test plan

- Extended 404 list, one forward table, one query rejection, one early 413.
- `bun run test` → all pass.

## Done criteria

- [ ] `grep -n "startsWith('show/')\|startsWith('user/')" worker/serializd-proxy.ts` → no match
- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] Only the two in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- A client GET path doesn't fit any of the listed shapes. Add it only if it
  is obviously the same family, otherwise report.
- Serializd usernames turn out to allow characters `SEGMENT` rejects (look for
  a username validation regex in `src/lib/providers/serializd/` or
  `serializdListsUrl`). Widen `SEGMENT` to match that validation, never to `.*`.
- The web smoke shows any `/api/serializd/` request failing.

## Maintenance notes

- Every new Serializd GET read needs its own rule here. That is intended: the
  proxy is an approved exception and should grow only on purpose.
- Rate limiting the `login` relay was considered and left for the owner. It
  needs a Workers rate-limit binding in `wrangler.jsonc`.
