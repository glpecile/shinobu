# Plan 023: A lint rule keeps Effect inside its sanctioned layers, and the Serializd connect forms stop importing it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1003c59..HEAD -- src/components/connect-serializd-button src/state/queries/serializd.ts oxlint-plugin-shinobu .oxlintrc.json AGENTS.md`
> Then re-run `grep -rln "from 'effect" src | grep -v "src/lib/providers\|src/lib/http\|src/state/queries"`.
> It must list exactly the five files in "Current state". Any other result is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 027 also edits AGENTS.md; whichever lands second rebases)
- **Category**: tech-debt (enforcement)
- **Planned at**: commit `1003c59`, 2026-10-31

## Why this matters

AGENTS.md decides that Effect lives only in `lib/providers/` and `lib/http/`,
that `state/queries/*` runs it with `Effect.runPromise`, and that "no component,
screen, or hook signature sees an `Effect`". It also says "A convention that
can be a lint rule is one, and lands with its rule." No rule exists:
`.oxlintrc.json` only bans the `effect` barrel import. So two components
already run Effects directly (the Serializd connect forms), and the next one
will pass CI too.

After this plan:
1. The Serializd connect components call plain promise functions in
   `state/queries/serializd.ts`, following the `exchangeTraktCode` pattern.
2. A custom rule, `shinobu/effect-boundary`, rejects any `effect` or `effect/*`
   import in `src/` outside the sanctioned places.
3. AGENTS.md names the three feature write hooks that legitimately run Effects
   at the mutation boundary, and the new rule.

## Current state

Files importing `effect` outside `src/lib/providers`, `src/lib/http`, `src/state/queries`:

- `src/components/connect-serializd-button/index.tsx` (web): **violation**
- `src/components/connect-serializd-button/index.native.tsx`: **violation**
- `src/features/log-media/use-log-media.ts`: mutation boundary (allowed)
- `src/features/watchlist-media/use-watchlist-media.ts`: mutation boundary (allowed)
- `src/features/watchlist-media/use-unwatchlist-media.ts`: mutation boundary (allowed)

Web component today (abridged):

```tsx
import * as Effect from 'effect/Effect';
import { loginToSerializd, validateAuthToken } from '@/lib/providers/serializd';
import { serializdDeps } from '@/state/queries/serializd';
import { connectSerializd } from '@/state/session/serializd';
...
  const submit = handleSubmit(async (values) => {
    setStatus('submitting');
    setErrorMessage(null);
    const deps = serializdDeps();
    const login = await Effect.runPromise(
      Effect.result(loginToSerializd(deps, { email: values.email.trim(), password: values.password })),
    );
    if (login._tag === 'Failure') {
      setErrorMessage(loginErrorText(login.failure.message));
      setStatus('idle');
      return;
    }
    let username = login.success.username;
    if (username === '') {
      const validated = await Effect.runPromise(Effect.result(validateAuthToken(deps, login.success.token)));
      if (validated._tag === 'Success') username = validated.success.username;
    }
    connectSerializd({ accessToken: login.success.token, username });
    setStatus('idle');
  });
```

Native component today (abridged):

```tsx
import * as Effect from 'effect/Effect';
...
  const onCaptured = async (captured: CapturedSerializdLogin) => {
    setStatus('validating');
    try {
      const result = await Effect.runPromise(validateAuthToken(serializdDeps(), captured.accessToken));
      connectSerializd({ accessToken: result.token, username: result.username });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };
```

The pattern to follow, `src/state/queries/trakt.ts`:

```ts
export function exchangeTraktCode(params: { code: string; redirectUri: string }): Promise<ProviderSession> {
  return Effect.runPromise(exchangeCodeForSession(traktDeps(), params));
}
```

`Effect.runPromise` rejects with the error instance itself (Effect v4), so
`error.message` carries the provider message.

A custom-rule exemplar that uses the filename,
`oxlint-plugin-shinobu/rules/no-unguarded-push.ts`:

```ts
  create(context) {
    if (context.filename.replaceAll('\\', '/').includes('/src/lib/navigation/')) return {};
    ...
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'expo-router') return;
```

The rule-test helper is `oxlint-plugin-shinobu/test/lint.ts`, with
`lint(rule, { 'path/file.ts': source })`, which writes files under a temp dir and
returns diagnostics. Exemplar test: `oxlint-plugin-shinobu/rules/no-pointer-events-prop.test.ts`.
Rules are registered in `oxlint-plugin-shinobu/index.ts` and enabled in the
`src/**/*.ts`, `src/**/*.tsx` override at the bottom of `.oxlintrc.json`.

Before writing Effect code, AGENTS.md requires reading
`node_modules/effect/AGENTS.md`. This plan only *calls* existing Effects, but
skim it anyway.

## Commands you will need

| Purpose   | Command                                                              | Expected on success |
|-----------|----------------------------------------------------------------------|---------------------|
| Install   | `bun install --frozen-lockfile`                                      | exit 0              |
| Typecheck | `bun typecheck`                                                      | exit 0              |
| Rule test | `bun test oxlint-plugin-shinobu/rules/effect-boundary.test.ts`       | all pass            |
| Lint      | `bun lint`                                                           | exit 0              |
| All tests | `bun run test`                                                       | all pass (never plain `bun test`) |

## Scope

**In scope**:
- `src/state/queries/serializd.ts` (add two functions)
- `src/components/connect-serializd-button/index.tsx`, `index.native.tsx`
- `oxlint-plugin-shinobu/rules/effect-boundary.ts` (create), `effect-boundary.test.ts` (create), `oxlint-plugin-shinobu/index.ts`
- `.oxlintrc.json` (enable the rule in the existing `src/**` override)
- `AGENTS.md` ("Tech stack" Effect bullet and "Enforcement" paragraph only)

**Out of scope**: the three feature write hooks (they stay as they are), `src/lib/providers/serializd/*`, and the barrel-import pattern already in `.oxlintrc.json`.

## Git workflow

- Branch: `chore/effect-boundary-rule`
- Commits: `refactor(serializd): run connect effects in the query layer`, then `chore(lint): enforce the Effect boundary`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Query-layer functions

In `src/state/queries/serializd.ts` add:

```ts
/** Web connect: email/password → bearer token, recovering a missing username. */
export async function loginSerializd(credentials: { email: string; password: string }): Promise<{ accessToken: string; username: string }> {
  const deps = serializdDeps();
  const login = await Effect.runPromise(loginToSerializd(deps, credentials));
  let username = login.username;
  if (username === '') {
    // Some login responses omit the username; the token's validation returns it.
    username = await Effect.runPromise(validateAuthToken(deps, login.token))
      .then((validated) => validated.username, () => '');
  }
  return { accessToken: login.token, username };
}

/** Native connect: a captured token → a validated session. */
export function validateSerializdToken(token: string): Promise<{ accessToken: string; username: string }> {
  return Effect.runPromise(validateAuthToken(serializdDeps(), token))
    .then((result) => ({ accessToken: result.token, username: result.username }));
}
```

Check the actual return types of `loginToSerializd` and `validateAuthToken` in
`src/lib/providers/serializd` and adjust the field names. Keep behaviour
identical: a username-recovery failure leaves `''`, as before.

**Verify**: `bun typecheck` → exit 0.

### Step 2: Components call them

- Web: remove the `effect/Effect`, `loginToSerializd`, `validateAuthToken` and
  `serializdDeps` imports. In `submit`, use
  `try { const session = await loginSerializd({ email: values.email.trim(), password: values.password }); connectSerializd(session); } catch (error) { setErrorMessage(loginErrorText(error instanceof Error ? error.message : String(error))); } finally { setStatus('idle'); }`.
  Keep `setStatus('submitting')` and `setErrorMessage(null)` at the start.
- Native: replace the `Effect.runPromise(...)` with `await validateSerializdToken(captured.accessToken)`
  and pass the result to `connectSerializd`. Remove the `effect` import.

**Verify**: `bun typecheck` → exit 0.
`grep -n "effect" src/components/connect-serializd-button/*.tsx` → no match.

### Step 3: The rule

Create `oxlint-plugin-shinobu/rules/effect-boundary.ts`:

- `meta.docs.description`: "Effect stays in lib/providers, lib/http, state/queries and the feature write hooks."
- In `create(context)`, normalize the filename (`replaceAll('\\', '/')`). Return
  `{}` (allowed) when it contains `/src/lib/providers/`, `/src/lib/http/` or
  `/src/state/queries/`, ends with `/src/features/log-media/use-log-media.ts`,
  `/src/features/watchlist-media/use-watchlist-media.ts` or
  `/src/features/watchlist-media/use-unwatchlist-media.ts`, or matches
  `\.test\.tsx?$`.
- Otherwise, on `ImportDeclaration` whose `source.value` matches `/^effect(\/|$)/`,
  report: "Effect stays behind the query layer: call a promise function from
  `state/queries/*` instead (AGENTS.md, Tech stack)."

Register it in `oxlint-plugin-shinobu/index.ts` as `'effect-boundary'`, and enable
`"shinobu/effect-boundary": "error"` in the `src/**` override of `.oxlintrc.json`.

**Verify**: `bun lint` → exit 0 (no current violations after step 2).

### Step 4: Rule test

Create `oxlint-plugin-shinobu/rules/effect-boundary.test.ts`, modelled on
`no-pointer-events-prop.test.ts`. Use one `test` that lints a map of files and
expects exactly one diagnostic, for the component:

```ts
expect(lint('effect-boundary', {
  'src/components/a.tsx': `import * as Effect from 'effect/Effect';`,
  'src/state/queries/b.ts': `import * as Effect from 'effect/Effect';`,
  'src/features/log-media/use-log-media.ts': `import * as Effect from 'effect/Effect';`,
})).toHaveLength(1);
```

**Verify**: `bun test oxlint-plugin-shinobu/rules/effect-boundary.test.ts` → pass.

### Step 5: AGENTS.md

- Tech stack, Effect bullet: after "`state/queries/*` calls `Effect.runPromise` in `queryFn`/`mutationFn`",
  add "(and so do the three feature write hooks, `use-log-media.ts`,
  `use-watchlist-media.ts` and `use-unwatchlist-media.ts`)". Append:
  "`shinobu/effect-boundary` enforces this."
- Enforcement paragraph: add `shinobu/effect-boundary` to the sentence that
  lists `shinobu/*` rules in `bun lint`.

**Verify**: `grep -n "effect-boundary" AGENTS.md` → 2 matches.

## Test plan

- One rule test (three files, one violation).
- No component tests (the repo doesn't test these forms). Rely on typecheck plus a manual web check if possible:
  `bun web` + `bun run dev:worker`, then Settings → Serializd → wrong password shows the API's message.
- `bun run test` → all pass.

## Done criteria

- [ ] `bun typecheck`, `bun lint`, `bun run test` exit 0
- [ ] `grep -rln "from 'effect" src | grep -v "src/lib/providers\|src/lib/http\|src/state/queries"` → only the three feature write hooks
- [ ] `grep -n "effect-boundary" .oxlintrc.json oxlint-plugin-shinobu/index.ts` → registered and enabled
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The web login error text changes for a wrong password. Compare
  `loginErrorText` input before and after. It must be the same message string.
- Importing `@/state/queries/serializd` into the native component creates an
  import cycle or a module that can't load (it already imports `serializdDeps`
  from there, so this is unlikely).
- `bun lint` reports violations in files not listed in "Current state".

## Maintenance notes

- A new feature write hook (e.g. pause/drop from todo 020) must either go
  through a `state/queries` function or be added to the rule's allowlist and
  to AGENTS.md in the same PR.
