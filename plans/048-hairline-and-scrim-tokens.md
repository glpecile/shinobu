# Plan 048: Hairlines and scrims are tokens, and only declared tokens typecheck

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 1361fa74..HEAD -- src/global.css src/lib/theme-color src/components src/features oxlint-plugin-shinobu .oxlintrc.json`
> If a file listed under "Scope" changed, compare its lines against "Current
> state". On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (design system)
- **Planned at**: commit `1361fa74`, 2026-11-27

## Why this matters

Colors are semantic tokens in `src/global.css`, but three roles have no token,
so each call site picks its own value:

1. The thin edge around a poster, still, or nested card is `border-border/40`,
   `/50`, or `/60` (22 sites, three values for one role).
2. The dark layer under text on an image is `bg-black/60` or `bg-black/70`,
   a palette color with no name.
3. White text on an image or gradient is `text-accent-foreground`. That token
   is named for text on the red accent, so its name lies at these sites.

An agent reading the code learns "pick an alpha" instead of a role. After this
plan, the roles are `border-hairline`, `bg-scrim`, and `text-on-scrim`, and a
lint rule rejects the ad hoc forms. Separately, `ThemeColorToken` is
`` `--color-${string}` ``, so `useThemeColor('--color-danger')` typechecks and
renders nothing. After this plan it is a union of the tokens `global.css`
declares, and a test keeps the two in sync.

## Current state

`src/global.css` declares each color twice, in `@variant light` and
`@variant dark`, inside `@layer theme { :root { … } }`. Uniwind requires every
variable in both. Excerpt of the light block's last lines:

```css
      --color-success-tonal: #dcfce7;
      --color-toast-shadow: #0000001f;
      --color-toast-surface: #ffffff;
      --color-logo-tile: #f5f5f5;
```

Dark: `--color-border: #333333;`. Light: `--color-border: #e5e5e5;`.
8-digit hex already works here (`--color-toast-shadow`).

`src/lib/theme-color/index.ts` (native) and `src/lib/theme-color/index.web.ts`
(web) both declare:

```ts
/** A `--color-*` token declared in `src/global.css`. */
export type ThemeColorToken = `--color-${string}`;
```

Every `border-border/NN` site (role: hairline):

| File | Line | Class today |
|---|---|---|
| `src/features/up-next/ui/week-strip.tsx` | 37 | `border-border/60` |
| `src/features/up-next/ui/badge.tsx` | 12 | `border-border/60` |
| `src/features/up-next/ui/episode-card.tsx` | 72, 78, 86 | `border-border/50` |
| `src/features/up-next/ui/episode-card.tsx` | 109 | `border-border/60` |
| `src/features/credit-timeline/credit-timeline.tsx` | 176 | `border-border/50` |
| `src/features/discussions/discussion-card.tsx` | 76 | `border-border/60` |
| `src/features/lists/poster-stack.tsx` | 31 | `border-border/40` |
| `src/features/lists/poster-stack.tsx` | 32 | `border-border/50` |
| `src/features/feed/reading-card.tsx` | 68 | `border-border/50` |
| `src/features/diary/diary-list.tsx` | 259 | `border-border/40` |
| `src/features/diary/diary-list.tsx` | 260 | `border-border/50` |
| `src/features/media-layout/poster-wall.tsx` | 126 | `border-border/50` |
| `src/features/detail-variants/detail-variants-section.tsx` | 89 | `border-border/50` |
| `src/components/overlay-actions-button.tsx` | 22 | `border-border/40` |
| `src/components/small-poster.tsx` | 24 | `border-border/50` |
| `src/components/poster-face.tsx` | 41 | `border-border/40` |
| `src/components/media-card.tsx` | 92 | `border-border/50` |
| `src/components/poster-placeholder.tsx` | 8 | `border-border/50` |

Every `bg-black/NN` site (role: scrim):

| File | Line | Class today |
|---|---|---|
| `src/features/up-next/ui/badge.tsx` | 12 | `bg-black/60` |
| `src/features/up-next/ui/episode-card.tsx` | 109 | `bg-black/70` |
| `src/components/overlay-actions-button.tsx` | 21 | `overlay: 'bg-black/60'` |
| `src/components/sheet/index.web.tsx` | 122 | `bg-black/60 backdrop-blur-sm` |

`src/components/lightbox/index.web.tsx:89` uses solid `bg-black` for a
full-screen photo viewer. It stays.

Every `accent-foreground` site that sits on a scrim or a poster gradient
(role: on-scrim):

| File | Line | Today |
|---|---|---|
| `src/features/up-next/ui/badge.tsx` | 18 | `'text-accent-foreground'` (on the `bg-black/60` chip) |
| `src/features/up-next/ui/episode-card.tsx` | 110 | `text-accent-foreground` (on the `bg-black/70` chip) |
| `src/components/overlay-actions-button.tsx` | 26 | `overlay: '--color-accent-foreground'` (glyph on `bg-black/60`) |
| `src/features/media-layout/poster-wall.tsx` | 91, 108 | `text-accent-foreground` (over a `LinearGradient`) |
| `src/features/media-layout/poster-wall.tsx` | 97 | `text-accent-foreground/70` |
| `src/components/media-card.tsx` | 100 | `text-accent-foreground` (over a `LinearGradient`) |
| `src/components/media-card.tsx` | 106, 117 | `text-accent-foreground/70` |

These `accent-foreground` uses are real text-on-accent and stay:
`src/features/diary/diary-activity.tsx:269,271`,
`src/features/lists/new-list-form.tsx:144`,
`src/components/native-switch/index.tsx:19`.

The lint-rule pattern to copy: `oxlint-plugin-shinobu/rules/no-pointer-events-prop.ts`
and its test `oxlint-plugin-shinobu/rules/no-pointer-events-prop.test.ts`:

```ts
import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Use style.pointerEvents rather than the deprecated prop.' },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name === 'pointerEvents') {
          context.report({ node, message: '…' });
        }
      },
    };
  },
});
```

```ts
import { expect, test } from 'bun:test';
import { lint } from '../test/lint.ts';

test('pointer events belong in style rather than the deprecated prop', () => {
  expect(
    lint('no-pointer-events-prop', {
      'view.tsx': `<><View style={{ pointerEvents: 'none' }} /><View pointerEvents="none" /></>`,
    }),
  ).toHaveLength(1);
});
```

Rules register in `oxlint-plugin-shinobu/index.ts` (an import plus a key in
`rules`) and turn on in `.oxlintrc.json` in the `overrides` entry whose
`"files"` is `["src/**/*.ts", "src/**/*.tsx"]` (the block that lists
`"shinobu/no-pointer-events-prop": "error"`).

Repo conventions: kebab-case filenames, `cn()` for class composition, comments
only for a reason or constraint.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `bun install`    | exit 0 (its `postinstall` regenerates `src/uniwind-types.d.ts`; that file must not change in the diff) |
| Typecheck | `bun typecheck`  | exit 0 |
| Lint      | `bun lint`       | exit 0 |
| Tests     | `bun test`       | all pass |
| One test  | `bun test src/lib/theme-color oxlint-plugin-shinobu/rules/no-adhoc-tints` | all pass |

## Scope

**In scope**:

- `src/global.css`
- `src/lib/theme-color/index.ts`, `src/lib/theme-color/index.web.ts`
- `src/lib/theme-color/tokens.ts` (create)
- `src/lib/theme-color/tokens.test.ts` (create)
- Every file in the three tables above, at the listed lines only
- `oxlint-plugin-shinobu/rules/no-adhoc-tints.ts` (create)
- `oxlint-plugin-shinobu/rules/no-adhoc-tints.test.ts` (create)
- `oxlint-plugin-shinobu/index.ts`
- `.oxlintrc.json`

**Out of scope**:

- Other alpha modifiers (`bg-surface/95`, `text-accent/60`, `bg-accent/25`,
  `text-muted/70`, `web:hover:bg-border/40`). They are states or a heat scale,
  not these roles. Do not touch them and do not make the rule flag them.
- `src/components/lightbox/index.web.tsx` (solid black viewer).
- `src/components/button.tsx` (plan 047 owns it).
- Renaming any existing token. Token values are persisted nowhere, but
  renames churn every screen.
- `AGENTS.md` and docs. Plan 049 writes them.

## Git workflow

- One commit per step group: (a) tokens and call sites, (b) typed token union
  and its test, (c) lint rule. Messages:
  - `feat(theme): add hairline, scrim, and on-scrim tokens`
  - `refactor(theme): type ThemeColorToken as the declared tokens`
  - `chore(lint): reject ad hoc hairline and scrim tints`
- End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Declare the three tokens

In `src/global.css`, add to the `@variant light` block, after
`--color-border`:

```css
      --color-hairline: #e5e5e580;
      --color-scrim: #00000099;
      --color-on-scrim: #ffffff;
```

and to the `@variant dark` block, after `--color-border`:

```css
      --color-hairline: #33333380;
      --color-scrim: #00000099;
      --color-on-scrim: #ffffff;
```

`#…80` is the border color at 50% (the most common of today's 40/50/60).
`#00000099` is black at 60%. Extend the comment above `@layer theme` with one
line: `` `hairline` edges posters and nested cards; `scrim` darkens an image under `on-scrim` text. ``

**Verify**: `grep -c "color-hairline\|color-scrim\|color-on-scrim" src/global.css` → `6`.

### Step 2: Move the call sites

For each row of the three tables, replace only the listed class:

- `border-border/40`, `border-border/50`, `border-border/60` → `border-hairline`
- `bg-black/60`, `bg-black/70` → `bg-scrim`
- `text-accent-foreground` → `text-on-scrim`; `text-accent-foreground/70` → `text-on-scrim/70`
- `'--color-accent-foreground'` in `overlay-actions-button.tsx`'s `ICON_TOKEN.overlay` → `'--color-on-scrim'`

Keep every other class in those strings, including the separate `border`
width class.

**Verify**:
- `grep -rnE "border-border/[0-9]+|bg-black/[0-9]+" src` → no output.
- `grep -rn "accent-foreground" src --include='*.tsx' --include='*.ts'` → only
  `diary-activity.tsx`, `new-list-form.tsx`, `native-switch/index.tsx`.
- `bun lint` → exit 0 (`shadcn/no-unknown-classes` accepts the new classes;
  if it reports them unknown, STOP).

Commit (a).

### Step 3: Type the tokens

Create `src/lib/theme-color/tokens.ts`:

```ts
/** Every `--color-*` token declared in `src/global.css`; `tokens.test.ts` keeps the two in sync. */
export const THEME_COLOR_TOKENS = [
  '--color-background',
  // … one entry per `--color-*` name in the `@variant dark` block, in file order
] as const;

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
```

List every `--color-*` name from `global.css` (25 after Step 1). In both
`index.ts` and `index.web.ts`, delete the local `ThemeColorToken` type and its
docblock, and add `export type { ThemeColorToken } from './tokens';` plus
`import type { ThemeColorToken } from './tokens';`. Callers keep importing
from `@/lib/theme-color`.

Create `src/lib/theme-color/tokens.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { THEME_COLOR_TOKENS } from './tokens';

test('the typed tokens are the ones global.css declares in both themes', () => {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const [light, dark] = css.split('@variant dark');
  const names = (block: string) => [...block.matchAll(/(--color-[a-z-]+):/g)].map((m) => m[1]);
  expect(names(dark)).toEqual([...THEME_COLOR_TOKENS]);
  expect([...names(light)].sort()).toEqual([...THEME_COLOR_TOKENS].sort());
});
```

If the relative `../../global.css` URL is wrong for this file's location, fix
the path; do not change the assertion.

**Verify**:
- `bun test src/lib/theme-color` → 1 pass.
- `bun typecheck` → exit 0. If a caller passes a token that is not declared,
  typecheck fails there: STOP and report the call site.
- Mutation check: copy `src/lib/theme-color/tokens.ts` to `/tmp/tokens.ts.bak`,
  delete one entry, run `bun test src/lib/theme-color` → fails; copy the file
  back and rerun → passes. Never use `git stash` for this.

Commit (b).

### Step 4: Lint the ad hoc forms

Create `oxlint-plugin-shinobu/rules/no-adhoc-tints.ts`. It reports any string
literal or template-literal quasi whose text matches
`/(?:^|[\s:'"`])(border-border\/\d+|(?:bg|text|border)-(?:black|white)\/\d+)(?=$|[\s'"`])/`.
Use visitors `Literal` (when `typeof node.value === 'string'`) and
`TemplateElement` (`node.value.raw`). Message:

```
Use a role token: `border-hairline` for a poster or nested-card edge, `bg-scrim` under text on an image (with `text-on-scrim`). See src/global.css.
```

Register it in `oxlint-plugin-shinobu/index.ts` as `'no-adhoc-tints'` and add
`"shinobu/no-adhoc-tints": "error"` to the `src/**` override in `.oxlintrc.json`.

Create `oxlint-plugin-shinobu/rules/no-adhoc-tints.test.ts` with one test, in
the style of `no-pointer-events-prop.test.ts`:

```ts
lint('no-adhoc-tints', {
  'card.tsx': `<>
    <View className="border border-border/50" />
    <View className="bg-black/60" />
    <View className="border border-hairline bg-scrim web:hover:bg-border/40 bg-black" />
  </>`,
})
```

→ `toHaveLength(2)`.

**Verify**:
- `bun test oxlint-plugin-shinobu/rules/no-adhoc-tints` → 1 pass.
- `bun lint` → exit 0.

Commit (c).

### Step 5: Gates

**Verify**: `bun typecheck`, `bun lint`, `bun test` → all exit 0.
`git status --short src/uniwind-types.d.ts` → no output.

## Test plan

- `src/lib/theme-color/tokens.test.ts`: pins the TS union to `global.css`, so
  a token added in CSS without the union (or the reverse) fails.
- `oxlint-plugin-shinobu/rules/no-adhoc-tints.test.ts`: one case with two
  violations and the allowed neighbours (`web:hover:bg-border/40`, solid
  `bg-black`).

## Done criteria

- [ ] `grep -rnE "border-border/[0-9]+|bg-black/[0-9]+" src` → no output
- [ ] `grep -n "ThemeColorToken = " src/lib/theme-color/*.ts` → only `tokens.ts`
- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun test` exits 0, including the two new tests
- [ ] `git diff --name-only 1361fa74` lists only in-scope files

## STOP conditions

- `shadcn/no-unknown-classes` rejects `border-hairline`, `bg-scrim`, or
  `text-on-scrim` after Step 1.
- `bun install` changes `src/uniwind-types.d.ts`.
- A line in the tables does not hold the class shown (drift).
- Typecheck after Step 3 fails on a token name that is not in `global.css`.
  Report it; do not add a token to make it pass.

## Maintenance notes

- Visual change: hairlines that were 40% or 60% are now 50%. The two stacked
  poster layers (`poster-stack.tsx:31`, `diary-list.tsx:259`) lose their
  slightly dimmer back edge; their `bg-surface/60` and offset still show depth.
  The episode-card count chip's scrim goes from 70% to 60%.
- Hot reload is enough: `global.css` and `src/` only. No native rebuild.
- A new color role is a token in both blocks of `global.css`, an entry in
  `tokens.ts`, and a line in `DESIGN.md` (plan 049).
