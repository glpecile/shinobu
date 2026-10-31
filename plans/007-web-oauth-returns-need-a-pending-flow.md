# Plan 007: Web OAuth returns only complete a connect this browser started

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/state/session/use-oauth-callback.ts src/state/session/use-oauth-callback.test.ts src/components/connect-trakt-button.tsx src/components/connect-anilist-button.tsx src/lib/providers/anilist/config.ts docs/solutions/trakt-oauth-setup.md`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches sign-in for two providers on web)
- **Depends on**: none
- **Category**: security + bug
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

Three defects share one cause: the web return leg of Trakt's and AniList's
OAuth flow can't tell a return the user started from any other URL.

1. **AniList login CSRF (security).** Any link to the web app's home page
   with `#access_token=<someone's token>` in the fragment replaces the
   visitor's AniList session. There is no prompt or toast. Afterwards the
   victim's AniList writes (progress, status) go to the other account, which
   then sees what the victim watches.
2. **Trakt `state` is never compared (security, lower likelihood).**
   expo-auth-session generates a `state` and the return strips it unread.
3. **Web Trakt reconnect from "needs credentials" silently fails (bug).** A
   user whose old Trakt token lost its client id saves new credentials and
   reconnects. Trakt returns `?code=…`, but the handler skips the exchange
   because a Trakt token is already stored. The single-use code is thrown
   away with no error, and the stale token then fails with 401.

After this plan, the connect button stores a pending flow (a random `state`)
before redirecting. The return leg completes only when a pending flow for that
provider exists, consumes it once, and requires the echoed `state` to match.
A pending flow — not "is a token stored?" — decides whether to exchange, which
fixes the reconnect too. Simkl already works this way (PKCE + persisted state)
and is not touched.

## Current state

Files:

- `src/state/session/use-oauth-callback.ts` — `handleOAuthReturn`, the web return leg (mounted on the home route `src/app/(tabs)/index.tsx`).
- `src/state/session/use-oauth-callback.test.ts` — routing tests with a stubbed `window` and an in-memory MMKV.
- `src/components/connect-trakt-button.tsx` — `useTraktConnect` (~line 120); web branch redirects with `window.location.assign(request.url)` (~line 157).
- `src/components/connect-anilist-button.tsx` — `useAniListConnect`; web branch redirects with `window.location.assign(url)`.
- `src/lib/providers/anilist/config.ts:58` — `anilistAuthorizeUrl(clientId)`.
- `src/lib/providers/simkl/auth-flow.ts` — the exemplar for a separate MMKV instance holding in-flight OAuth material.
- `docs/solutions/trakt-oauth-setup.md` — records the "skip when already connected" guard this plan replaces, and points at a file path that no longer exists.

AniList return today (`use-oauth-callback.ts`):

```ts
function consumeAniListReturnFragment(): string | null {
  const { hash } = window.location;
  if (!hash.includes('access_token=')) return null;
  const carried = window.location.href;
  const url = new URL(carried);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
  return carried;
}
...
  const anilistReturn = consumeAniListReturnFragment();
  if (anilistReturn != null) {
    if (!connectAniListFromRedirect(anilistReturn)) {
      setStatus('error');
    }
    return;
  }
```

Trakt return today:

```ts
function consumeTraktReturnParams(): { code: string | null; denied: boolean } {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const denied = params.get('error') != null;
  if (code == null && !denied) return { code: null, denied: false };
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('state');
  window.history.replaceState(null, '', url.toString());
  return { code, denied };
}
...
  const { code, denied } = consumeTraktReturnParams();
  if (denied) { setStatus('error'); return; }
  if (code == null) return;
  if (
    connectedProviderIds().includes('trakt') ||
    getClientIdForProvider('trakt') === '' ||
    getClientSecretForProvider('trakt') === ''
  ) {
    return;
  }
  setStatus('exchanging');
  ...
```

AniList authorize URL (`anilist/config.ts`):

```ts
export function anilistAuthorizeUrl(clientId: string): string {
  return `${ANILIST_AUTHORIZE_URL}?client_id=${clientId}&response_type=token`;
}
```

Trakt connect, web branch (`connect-trakt-button.tsx`):

```ts
    request = await loadAsync({ clientId: id, responseType: ResponseType.Code, redirectUri, usePKCE: false }, discovery);
    ...
    if (Platform.OS === 'web') {
      window.location.assign(request.url);
      return;
    }
```

`request.state` is the `state` expo-auth-session put into `request.url`.

The Simkl exemplar (`src/lib/providers/simkl/auth-flow.ts`) — match its shape:

```ts
const flowStorage = createMMKV({ id: 'simkl-auth-flow' });
const FLOW_KEY = 'simklAuthFlow';
export function saveSimklAuthFlow(flow: SimklAuthFlow): void { flowStorage.set(FLOW_KEY, JSON.stringify(flow)); }
export function getSimklAuthFlow(): SimklAuthFlow | null { ... }
export function clearSimklAuthFlow(): void { flowStorage.remove(FLOW_KEY); }
```

It uses its own MMKV instance id so writing it never fires `onSessionChange`
listeners mid-OAuth. MMKV falls back to `localStorage` on web.

AniList's OAuth server is Laravel Passport, whose implicit grant echoes a
`state` request parameter in the redirect fragment. Step 0 confirms this. The
design below stays safe even if it doesn't: the pending flow alone already
blocks a drive-by link.

## Commands you will need

| Purpose   | Command                                                 | Expected on success |
|-----------|---------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                         | exit 0              |
| Typecheck | `bun typecheck`                                         | exit 0              |
| One file  | `bun test src/state/session/use-oauth-callback.test.ts` | all pass            |
| All tests | `bun run test`                                          | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                              | exit 0              |
| Web smoke | `bun web` (and `bun run dev:worker` beside it)          | app loads at the printed URL |

## Scope

**In scope**:
- `src/state/session/oauth-flow.ts` (create)
- `src/state/session/use-oauth-callback.ts`
- `src/state/session/use-oauth-callback.test.ts`
- `src/components/connect-trakt-button.tsx` — the web branch of `useTraktConnect.connect` only
- `src/components/connect-anilist-button.tsx` — the web branch of `useAniListConnect.connect` only
- `src/lib/providers/anilist/config.ts` — `anilistAuthorizeUrl` only
- `docs/solutions/trakt-oauth-setup.md` — the "Web" section only

**Out of scope**:
- The Simkl flow (`simkl/auth.ts`, `simkl/auth-flow.ts`) and its return branch in `handleOAuthReturn`.
- Native connect paths (`openAuthSessionAsync` binds the return to the session it opened).
- `providerIsUsable` / `trakt-migration.ts`.
- Encrypting storage (todos/003).

## Git workflow

- Branch: `fix/web-oauth-pending-flow`
- Commits: one per step 1–4 is fine, e.g. `fix(session): require a pending flow for web OAuth returns`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm AniList echoes `state`

Run:
`curl -s -o /dev/null -w "%{redirect_url}\n" "https://anilist.co/api/v2/oauth/authorize?client_id=1&response_type=token&state=probe123"`

Any answer is fine: you are only checking whether the server rejects the
`state` parameter (a 4xx/5xx status). If you can sign in to AniList in a
browser, also check that the post-consent redirect fragment contains
`state=probe123`. Record what you saw in your final report. If you can't
confirm the echo, continue: step 3 accepts a missing `state` as long as a
pending flow exists.

**Verify**: you have a one-line note for the report.

### Step 1: Create the pending-flow store

Create `src/state/session/oauth-flow.ts`:

- Own MMKV instance: `createMMKV({ id: 'oauth-flow' })` (import from `react-native-mmkv`, as `simkl/auth-flow.ts` does).
- Type `type PendingOAuthProvider = 'trakt' | 'anilist';`
- `export function beginOAuthFlow(provider: PendingOAuthProvider, state: string): void`
  stores `JSON.stringify({ state, startedAt: Date.now() })` under `oauthFlow.<provider>`.
- `export function takeOAuthFlow(provider: PendingOAuthProvider): string | null`
  reads the entry, **always removes it**, and returns its `state` only if it
  parses and `Date.now() - startedAt` is at most 15 minutes. Otherwise `null`.
- A docblock on the module: a web OAuth return is honoured only when this
  browser started that flow; the entry is single-use so a replayed URL does
  nothing; it has its own MMKV id so it never fires `onSessionChange`.
  Write the 15-minute limit as a named constant with a one-line reason
  ("longer than any consent screen, short enough that a stale tab can't use it").

**Verify**: `bun typecheck` → exit 0.

### Step 2: Start flows from the connect buttons (web only)

- `anilist/config.ts`: give `anilistAuthorizeUrl` an optional second
  parameter `state?: string`. When it is given, append
  `&state=${encodeURIComponent(state)}`. Without it, the URL is unchanged.
- `connect-anilist-button.tsx`, web branch of `connect`: generate
  `const state = crypto.randomUUID();`, call `beginOAuthFlow('anilist', state)`,
  build the URL with `anilistAuthorizeUrl(id, state)`, then
  `window.location.assign(...)`. The native branch keeps `anilistAuthorizeUrl(id)`
  with no state. Read the current function first and move the URL construction
  into the branches only if needed. Keep the native behaviour byte for byte.
- `connect-trakt-button.tsx`, web branch: before `window.location.assign(request.url)`
  call `beginOAuthFlow('trakt', request.state)`. If `request.state` is not a
  non-empty string, set status `'error'` and return without redirecting.

`crypto.randomUUID()` is a browser global in secure contexts, and `localhost`
counts as one. This code runs only on web, so no `expo-crypto` import is needed.

**Verify**: `bun typecheck` → exit 0. `bun lint` → exit 0.

### Step 3: Require the pending flow on return

In `use-oauth-callback.ts`:

- AniList branch: after `consumeAniListReturnFragment()` returns a URL, call
  `const expected = takeOAuthFlow('anilist');`.
  - `expected == null` → `return;` without connecting and without an error
    status (a stray or replayed link). The fragment is already stripped.
  - Read the returned fragment's `state`:
    `new URLSearchParams(anilistReturn.slice(anilistReturn.indexOf('#') + 1)).get('state')`.
    If it is present and `!== expected` → `setStatus('error'); return;`.
  - Otherwise call `connectAniListFromRedirect(anilistReturn)` as today.
- Trakt: make `consumeTraktReturnParams` also return `state: params.get('state')`.
  Replace the guard. The new order is:
  1. `denied` → `setStatus('error')` (unchanged). Also call `takeOAuthFlow('trakt')`
     to clear the flow.
  2. `code == null` → return (unchanged).
  3. `const expected = takeOAuthFlow('trakt'); if (expected == null) return;`
  4. `if (state !== expected) { setStatus('error'); return; }`
  5. Missing client id or secret → return (unchanged).
  6. Exchange. **Remove** the `connectedProviderIds().includes('trakt')` check.
     A matching pending flow means the user just asked to (re)connect, and
     the exchange overwrites the stored session. Remove the
     `connectedProviderIds` import if nothing else uses it. (The Simkl branch still does — keep it there.)
- Update the comments above both consumers and `handleOAuthReturn` to describe
  the pending-flow rule instead of "already connected".

**Verify**: `bun typecheck` → exit 0. Then
`bun test src/state/session/use-oauth-callback.test.ts` → expect exactly two
failures: `'an unmarked ?code= return stays on the Trakt path (backward compat)'`
and `'an AniList fragment return still wins before either code path'`. They
have no pending flow. Fix them in step 4.

### Step 4: Tests

In `use-oauth-callback.test.ts`:

- Import `beginOAuthFlow` from `./oauth-flow` with `await import`, after the
  mocks, like the other imports. The in-memory MMKV mock already backs every
  instance with the shared `store`, and `beforeEach` clears it.
- Fix the two failing tests by calling `beginOAuthFlow('trakt', 'st-2')` and
  `beginOAuthFlow('anilist', 'st-a')` first. Put `&state=st-a` in the AniList
  fragment URL.
- Add exactly these cases (one per new branch):
  1. AniList fragment with **no** pending flow → `anilistRedirectCalls` stays
     empty, statuses `[]`, and the fragment is still stripped (`replacedUrls` has 1 entry).
  2. AniList fragment whose `state` differs from the pending one → no connect,
     statuses `['error']`.
  3. Trakt `?code=…&state=st-9` with a pending flow `st-9` **while a Trakt
     session is already stored** (`setProviderSession('trakt', { accessToken: 'old' })`)
     plus client id and secret → `traktExchangeCalls` has 1 entry. This is the
     reconnect regression.
  4. Trakt `?code=…&state=wrong` with pending `st-9` → no exchange, statuses `['error']`.
  5. Trakt `?code=…` with no pending flow and no stored session → no exchange, statuses `[]`.

**Verify**: `bun test src/state/session/use-oauth-callback.test.ts` → all pass.

### Step 5: Update the solution doc

In `docs/solutions/trakt-oauth-setup.md`, section "Web: the `?code=` lands on the redirect-URI route":

- Fix the stale path: the handler is `src/state/session/use-oauth-callback.ts`,
  mounted by `src/app/(tabs)/index.tsx`.
- Replace the bullet "**Skip the exchange when Trakt is already connected.**"
  with: "**Exchange only for a pending flow.** `connect` stores the request
  `state` (`state/session/oauth-flow.ts`). The return exchanges only when a
  pending flow exists and its `state` matches, then consumes it. A leftover tab
  or a replayed URL finds no flow and does nothing. A reconnect over a stale
  token works, because the stored token no longer decides anything."

**Verify**: `grep -n "use-trakt-oauth-callback" docs/solutions/trakt-oauth-setup.md` → no matches.

### Step 6: Manual web smoke (if you can run a browser)

Run `bun web` and `bun run dev:worker`. Open `http://localhost:8081/#access_token=x&token_type=Bearer`
in a fresh profile. AniList must stay disconnected, and the fragment must
disappear from the address bar. If you have Trakt or AniList test
credentials, run one real connect each and confirm it completes.

**Verify**: describe the result in the report, or say the smoke was not possible.

## Test plan

- Five new cases plus two updated ones in `use-oauth-callback.test.ts` (listed in step 4).
- All existing Simkl cases must pass untouched.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun run test` exits 0
- [ ] `grep -n "connectedProviderIds().includes('trakt')" src/state/session/use-oauth-callback.ts` → no match
- [ ] `grep -n "takeOAuthFlow" src/state/session/use-oauth-callback.ts` → at least 2 matches
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- AniList rejects an authorize request carrying `state` (an HTTP 4xx/5xx in
  step 0, or a visible error page). Don't ship a broken connect. Report back.
- `request.state` from expo-auth-session's `loadAsync` turns out to be empty
  or undefined on web.
- A native connect path would need to change for tests to pass.

## Maintenance notes

- A connect started before this deploy and returning after it has no pending
  flow, so it is silently ignored and the user taps connect again. That's acceptable.
- `localStorage` (the web MMKV fallback) is shared across tabs. Two parallel
  connects in two tabs: the second overwrites the first's `state`, and the
  first then fails with a visible error. Rare and safe.
- Reviewers: check that the AniList and Trakt branches consume the flow on
  every path that reads it (`take` removes it), and that the Simkl branch is untouched.
- Native AniList still sends no `state` (the auth session is bound). If a
  native deep-link return path is ever added, give it the same check.
