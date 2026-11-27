# Plan 047: Button has four variants, and `pressed` draws the selected state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 1361fa74..HEAD -- src/components/button.tsx src/components/like-button.tsx src/features/card-actions/card-actions-sheet.tsx src/components/connect-tmdb-token.tsx src/app/dev/letterboxd-watchlist-spike/index.native.tsx`
> If any changed, compare against "Current state". On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (design system)
- **Planned at**: commit `1361fa74`, 2026-11-27

## Why this matters

`Button` offers seven variants. Three of them (`outline`, `quiet-accent`,
`accent-ghost`) exist only to draw a liked heart in red. `Button` already has a
`pressed` prop for that state. An agent that sees seven variants has to guess
which one fits, and the call sites show the guesses: a destructive "Remove"
uses `quiet` in four places, `quiet-accent` in one, and `outline` in one. After
this plan, `ButtonVariant` is `'log' | 'primary' | 'quiet' | 'ghost'`. Each
names a role. A selected toggle is `pressed`, not a variant. An invented
variant such as `"outline"` or `"destructive"` fails `bun typecheck`.

## Current state

`src/components/button.tsx:22-61` (the variant union and its three maps):

```ts
export type ButtonVariant =
  'log' | 'primary' | 'outline' | 'quiet' | 'quiet-accent' | 'ghost' | 'accent-ghost';

const CONTAINER: Record<ButtonVariant, { on: string; off: string }> = {
  log: { on: 'bg-log', off: 'bg-log/40' },
  primary: { on: 'border border-foreground bg-foreground', off: 'border border-transparent bg-foreground/40' },
  outline: { on: 'border border-accent', off: 'border border-accent/40' },
  quiet: { on: 'border border-border web:hover:bg-border/40', off: 'border border-border opacity-60' },
  'quiet-accent': { on: 'border border-border', off: 'border border-border opacity-60' },
  ghost: { on: 'web:hover:bg-border/40', off: 'opacity-60' },
  'accent-ghost': { on: '', off: 'opacity-60' },
};

const LABEL: Record<ButtonVariant, { on: string; off: string }> = {
  log: { on: 'text-log-foreground', off: 'text-log-foreground' },
  primary: { on: 'text-background', off: 'text-background' },
  outline: { on: 'text-accent', off: 'text-accent/60' },
  quiet: { on: 'text-foreground', off: 'text-muted' },
  'quiet-accent': { on: 'text-accent', off: 'text-accent/60' },
  ghost: { on: 'text-foreground', off: 'text-muted' },
  'accent-ghost': { on: 'text-accent', off: 'text-accent/60' },
};

const SPINNER_TOKEN: Record<ButtonVariant, ThemeColorToken> = {
  log: '--color-log-foreground',
  primary: '--color-background',
  outline: '--color-accent',
  quiet: '--color-foreground',
  'quiet-accent': '--color-accent',
  ghost: '--color-foreground',
  'accent-ghost': '--color-accent',
};
```

(The real file formats `primary` and `quiet` over several lines. Match it by
content, not by line breaks.)

Where those maps are read, in `Button`'s body:

- `const spinnerToken = useThemeColor(SPINNER_TOKEN[variant]);` (about line 205)
- `unavailable ? CONTAINER[variant].off : CONTAINER[variant].on` (about line 254)
- `value={{ token: SPINNER_TOKEN[variant], size: SIZE[size].icon }}` (about line 295)
- `unavailable ? LABEL[variant].off : LABEL[variant].on` (about line 317)
- `value={{ token: SPINNER_TOKEN[variant], size: TRAILING_ICON[size] }}` (about line 332)

`pressed` is already a prop (`pressed?: boolean`). Today it only sets
`accessibilityState.selected` and `aria-pressed`. It has no visual effect.

`src/components/like-button.tsx` maps its own `variant` prop to the three
accent variants:

```ts
  variant = 'outline',
}: { ...
  variant?: 'outline' | 'ghost' | 'quiet';
}) {
  let buttonVariant: ButtonVariant;
  switch (variant) {
    case 'quiet':
      buttonVariant = liked ? 'quiet-accent' : 'quiet';
      break;
    case 'ghost':
      buttonVariant = liked ? 'accent-ghost' : 'ghost';
      break;
    case 'outline':
      buttonVariant = liked ? 'outline' : 'quiet';
      break;
  }
  return (
    <Button ... pressed={liked} size={size} variant={buttonVariant} />
```

Its callers: `src/features/log-media/log-confirm-sheet.tsx:174` and
`src/app/up-next-demo.tsx:227` pass no `variant` (so `'outline'` today).
`src/features/lists/list-like-button.tsx` passes `'quiet' | 'ghost'` (its
default is `'quiet'`); it needs no change.

The other call sites of the removed variants:

- `src/features/card-actions/card-actions-sheet.tsx:347`: "Remove from list"
  (`trash-outline`) uses `variant="quiet-accent"`. The "Hide" button right
  below it uses `variant="quiet"`.
- `src/components/connect-tmdb-token.tsx:134`: "Remove" TMDB token
  (`trash-outline`) uses `variant="outline"`.
- `src/app/dev/letterboxd-watchlist-spike/index.native.tsx:60` ("Load") and
  `:91` ("Print report") use `variant="outline"`. This is a dev spike screen.

The rule the repo already follows elsewhere for destructive actions: the entry
point is `quiet` with `trash-outline` (`src/features/lists/hardcover-list-detail.tsx:249`,
`src/features/lists/delete-list.tsx:90`, `src/features/log-media/pending-logs-sheet.tsx:92`),
and its confirm step is the default `primary` with `trash-outline`
(`src/features/lists/delete-list.tsx:50`). Solid red is reserved for logging.

Repo conventions that apply:

- A `switch` on a union names every member. A lookup keyed by a union is a
  `Record<Union, …>` so a new member fails typecheck. Match the existing maps.
- Compose classes with `cn()` from `@/lib/cn`. Never a template literal.
- Comments say how a thing is used or why, never what the code says.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `bun install`    | exit 0              |
| Typecheck | `bun typecheck`  | exit 0, no errors   |
| Lint      | `bun lint`       | exit 0, `Found 0 warnings and 0 errors` |
| Tests     | `bun run test`   | all pass (bare `bun test` is refused) |

## Scope

**In scope** (the only files you should modify):

- `src/components/button.tsx`
- `src/components/like-button.tsx`
- `src/features/card-actions/card-actions-sheet.tsx`
- `src/components/connect-tmdb-token.tsx`
- `src/app/dev/letterboxd-watchlist-spike/index.native.tsx`

**Out of scope**:

- `src/components/fab.tsx`. `Fab` has its own `'outline' | 'filled' | 'log'`
  variants. They are a different component; leave them.
- `src/features/lists/list-like-button.tsx`. Its `'quiet' | 'ghost'` values
  stay valid.
- Any `variant` prop on a component that is not `Button` or `LikeButton`
  (for example `variant="rows"` on another component).
- `Button`'s sizes, shapes, icons, or the glyph table in `ButtonIcon`'s docblock.
- `AGENTS.md` and any doc. Plan 049 writes the docs.

## Git workflow

- Branch: the worktree's branch. One commit for the whole plan.
- Message (Conventional Commits, as in `git log`):
  `refactor(button): draw the selected state from pressed and drop three variants`
- End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Shrink the variant union and its maps

In `src/components/button.tsx`:

1. Set `export type ButtonVariant = 'log' | 'primary' | 'quiet' | 'ghost';`
2. Delete the `outline`, `'quiet-accent'`, and `'accent-ghost'` entries from
   `CONTAINER`, `LABEL`, and `SPINNER_TOKEN`.
3. Add, next to `LABEL`:

```ts
// A toggle that is on (a liked heart) keeps its variant's frame and turns its
// label and glyphs accent. Filled variants have no room for a second colour.
const SELECTABLE: Record<ButtonVariant, boolean> = {
  log: false,
  primary: false,
  quiet: true,
  ghost: true,
};
const SELECTED_LABEL = { on: 'text-accent', off: 'text-accent/60' };
```

4. In `Button`'s body, after `const unavailable = …`, add:

```ts
  const selected = pressed === true && SELECTABLE[variant];
  const label = selected ? SELECTED_LABEL : LABEL[variant];
  const glyphToken: ThemeColorToken = selected ? '--color-accent' : SPINNER_TOKEN[variant];
```

   The name `label` is taken by the prop. Name the class pair `labelClass`
   instead and use it in place of `LABEL[variant]`.

5. Replace the reads:
   - `useThemeColor(SPINNER_TOKEN[variant])` → `useThemeColor(glyphToken)`
     (it must stay after the `glyphToken` line; move the `spinnerToken` line
     down if needed).
   - Both `ButtonIconContext.Provider` values: `token: SPINNER_TOKEN[variant]`
     → `token: glyphToken`.
   - `unavailable ? LABEL[variant].off : LABEL[variant].on` →
     `unavailable ? labelClass.off : labelClass.on`.
   - Leave `CONTAINER[variant]` as it is.

**Verify**: `grep -nE "outline|quiet-accent|accent-ghost" src/components/button.tsx`
→ only matches inside the `ButtonIcon` glyph table (`eye-outline`,
`trash-outline`, and so on) and `focus-visible:outline` classes. No variant
key or union member.

### Step 2: Pass LikeButton's variant through

In `src/components/like-button.tsx`:

- Change the prop to `variant?: 'quiet' | 'ghost'` with default `'quiet'`.
- Delete the `buttonVariant` switch and the `ButtonVariant` import.
- Pass `variant={variant}` to `Button`. Keep `pressed={liked}`.

**Verify**: `grep -n "ButtonVariant\|switch" src/components/like-button.tsx` → no output.

### Step 3: Move the other call sites to `quiet`

- `src/features/card-actions/card-actions-sheet.tsx:347`: `variant="quiet-accent"` → `variant="quiet"`.
- `src/components/connect-tmdb-token.tsx:134`: `variant="outline"` → `variant="quiet"`.
- `src/app/dev/letterboxd-watchlist-spike/index.native.tsx:60` and `:91`:
  `variant="outline"` → `variant="quiet"`.

**Verify**: `grep -rnE "variant=\"(outline|quiet-accent|accent-ghost)\"|'(quiet-accent|accent-ghost)'" src --include='*.tsx' --include='*.ts' | grep -v "src/components/fab.tsx"`
→ only lines that set a `Fab`'s `variant="outline"`, if any. Open each hit and
confirm the element is `<Fab`. Any `<Button` or `<LikeButton` hit is a failure.

### Step 4: Gates

**Verify**:
- `bun typecheck` → exit 0.
- `bun lint` → exit 0.
- `bun test` → all pass.

## Test plan

No new test. The repo has no `Button` render tests, and the change is a
type-level contraction that `bun typecheck` checks at every call site.

## Done criteria

- [ ] `grep -n "export type ButtonVariant" src/components/button.tsx` prints `'log' | 'primary' | 'quiet' | 'ghost'`
- [ ] `bun typecheck` exits 0
- [ ] `bun lint` exits 0
- [ ] `bun test` exits 0
- [ ] `git diff --name-only 1361fa74` lists only the five in-scope files

## STOP conditions

- `bun typecheck` reports a `Button` or `LikeButton` call site that uses a
  removed variant and is not one of the four listed in Step 3. Report its path;
  do not pick a variant for it.
- Any file outside the in-scope list fails typecheck because of this change.
- `pressed` turns out to be set on a `primary` or `log` button that relies on
  it for a visual (it has no visual today, so this would mean drift).

## Maintenance notes

- Visible changes a reviewer should expect: the like heart in the log confirm
  sheet loses its red border (grey border, red heart, as in list sheets). The
  TMDB "Remove" button and "Remove from list" lose their red text. The
  up-next demo's `pressed` segment buttons now show accent text when chosen.
- A new toggle button uses `quiet` or `ghost` with `pressed`. A new variant
  needs a role that none of the four covers, and lands in `DESIGN.md` (plan 049).
