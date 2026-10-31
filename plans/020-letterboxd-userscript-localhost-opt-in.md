# Plan 020: The Letterboxd userscript trusts localhost only after an explicit opt-in

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- public/letterboxd.user.js scripts/letterboxd-tampermonkey-spike.test.ts docs/solutions/letterboxd-web-userscript-bridge.md`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live files before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

On web, Letterboxd writes go through a Tampermonkey userscript the user
installs from `/letterboxd.user.js`. On the Shinobu page, the script accepts a
`postMessage` request and opens a Letterboxd tab that performs the write with
the user's real Letterboxd session: a diary log, a watchlist change, a list
like, a list membership change, list create or list rename.

The script treats **any** page served on `http://localhost` or `127.0.0.1`
ports 8081, 8082 or 19006 as Shinobu. Port 8081 is Metro's default for every
React Native or Expo project. A user who installed the script from
production and later runs any other project's dev server (or any local tool
on those ports) lets that page write to their Letterboxd account. The only
check is the public username. The localhost trust exists for Shinobu's own
development. After this plan it requires a per-install opt-in value that only
a developer sets.

## Current state

`public/letterboxd.user.js` (header and origin check):

```js
// @version      0.9.1
...
// @match        https://shinobu.glpecile.xyz/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @match        https://letterboxd.com/*
...
// @grant        GM.getValue
...
(async () => {
  'use strict';
  const page = unsafeWindow;
  const origin = page.location.origin;
  ...
  const appOrigin = origin === 'https://shinobu.glpecile.xyz' ||
    /^http:\/\/(localhost|127\.0\.0\.1):(8081|8082|19006)$/.test(origin);

  if (appOrigin) {
    ... page.addEventListener('message', …) ...
    page.document.documentElement.setAttribute('data-shinobu-letterboxd-bridge', '11');
    return;
  }
```

`GM.getValue` is already granted. Its signature is `GM.getValue(key, default) → Promise`.

Tests: `scripts/letterboxd-tampermonkey-spike.test.ts` loads the script text
and runs it as `run(GM, unsafeWindow)` against a happy-dom `Window` whose URL
is **`http://localhost:8081/`** (several tests). The first test calls
`run({}, { location: app.location, document: app.document, addEventListener() {} })`
with an empty `GM` object.

Docs: `docs/solutions/letterboxd-web-userscript-bridge.md` ("Boundaries" section)
describes the script. The app detects capabilities through the
`data-shinobu-letterboxd-bridge` attribute (`src/lib/providers/letterboxd/userscript-bridge/index.web.ts`).
That attribute number is a **capability level**, not the script version. Don't change it.

## Commands you will need

| Purpose   | Command                                                    | Expected on success |
|-----------|------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                            | exit 0              |
| One file  | `bun test scripts/letterboxd-tampermonkey-spike.test.ts`   | all pass            |
| All tests | `bun run test`                                             | all pass (never plain `bun test`) |
| Lint      | `bun lint`                                                 | exit 0              |

## Scope

**In scope**: `public/letterboxd.user.js`, `scripts/letterboxd-tampermonkey-spike.test.ts`,
`docs/solutions/letterboxd-web-userscript-bridge.md` ("Boundaries" only).

**Out of scope**: the Letterboxd-tab half of the script (after
`if (origin !== 'https://letterboxd.com') return;`), the app-side bridge code,
the capability attribute value, and the Worker.

## Git workflow

- Branch: `security/userscript-localhost-opt-in`
- One commit: `fix(letterboxd): require an opt-in before the userscript trusts localhost`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Gate localhost behind a stored opt-in

Replace the `appOrigin` computation with:

```js
  const devOrigin = /^http:\/\/(localhost|127\.0\.0\.1):(8081|8082|19006)$/.test(origin);
  // Local dev servers on these ports are not necessarily Shinobu (8081 is
  // every Expo project's Metro). Developers opt in per install by setting
  // `shinobu-trust-localhost` to true in Tampermonkey's storage tab.
  const appOrigin = origin === 'https://shinobu.glpecile.xyz' ||
    (devOrigin && await GM.getValue('shinobu-trust-localhost', false) === true);
```

Keep the `@match` localhost lines. Without them the opt-in can't work, and
they do nothing without it.

Bump `@version` to `0.10.0` so installed copies update.

**Verify**: `node --check public/letterboxd.user.js` → exit 0 (syntax only).

### Step 2: Tests

In `scripts/letterboxd-tampermonkey-spike.test.ts`:

- Change every app `Window` URL from `http://localhost:8081/` to
  `https://shinobu.glpecile.xyz/`. Production is the origin the tests mean to
  exercise, and it needs no opt-in. Check each `event.origin` value too: they
  read `app.location.origin`, so they follow.
- Add one test: a `Window` at `http://localhost:8081/`,
  `run({ getValue: async () => false }, { location, document, addEventListener() {} })`.
  Expect `document.documentElement.getAttribute('data-shinobu-letterboxd-bridge')`
  to be `null` (the script didn't attach). Then the same with
  `getValue: async () => true` → the attribute is `'11'`. One test, two
  assertions: the gate's two branches.

**Verify**: `bun test scripts/letterboxd-tampermonkey-spike.test.ts` → all pass.

### Step 3: Document it

In the doc's "Boundaries" list add: "On `localhost` dev ports the script stays
inert unless `shinobu-trust-localhost` is `true` in Tampermonkey's storage for
the script. Set it only on a machine where those ports serve Shinobu."

**Verify**: `grep -n "shinobu-trust-localhost" docs/solutions/letterboxd-web-userscript-bridge.md` → 1 match.

## Test plan

- One new test (localhost off/on). Existing tests move to the production origin.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun run test` and `bun lint` exit 0
- [ ] `grep -n "@version" public/letterboxd.user.js` → `0.10.0`
- [ ] `grep -n "shinobu-trust-localhost" public/letterboxd.user.js` → 1 match
- [ ] Only the three in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The app-side code checks the script's `@version` and would refuse 0.10.0
  (`grep -rn "0\.9\.1\|@version" src`).
- The tests depend on localhost specifically for a reason other than the origin
  check (e.g. URL parsing of the port). Report it rather than forcing the switch.

## Maintenance notes

- Contributors running the web app locally must set the opt-in once per
  Tampermonkey install. Mention it in any future contributor guide.
- If a staging origin is ever added, list it next to the production origin, not under the dev regex.
