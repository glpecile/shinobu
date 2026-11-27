# Plan 049: DESIGN.md says which token, component, and variant to pick

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. Do not update
> `plans/README.md`: the reviewer maintains the index.
>
> **Precondition (run first)**: plans 047 and 048 must be in your branch.
> `grep -n "export type ButtonVariant" src/components/button.tsx` must print
> `'log' | 'primary' | 'quiet' | 'ghost'`, and `src/lib/theme-color/tokens.ts`
> must exist. If either fails, STOP.
>
> **Drift check**: `git diff --stat 1361fa74..HEAD -- AGENTS.md CLAUDE.md`
> must be empty. If not, compare the AGENTS.md excerpts below to the file; on a
> mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/047-button-variants-are-roles-not-states.md, plans/048-hairline-and-scrim-tokens.md
- **Category**: docs (design system)
- **Planned at**: commit `1361fa74`, 2026-11-27

## Why this matters

The visual rules live in two `AGENTS.md` sections, a docblock in
`button.tsx`, and lint messages. None of them says which token fills which
role, which `Button` variant goes where, or shows a right and a wrong example.
An agent that builds a screen has to infer that from call sites, and the call
sites disagree (plan 047 fixed one case). This plan writes one `DESIGN.md` at
the repo root that an agent reads before it builds UI. It moves the two
`AGENTS.md` sections there, so the rules have one home. A test fails when a
token exists that `DESIGN.md` does not describe.

## Current state

`CLAUDE.md` is two lines:

```md
# Shinobu

@AGENTS.md
```

`AGENTS.md` has a section `## Theming and typography` (starts with "Colors are
tokens in `src/global.css`, never hex in a component.") and a section
`## Class names and buttons` (starts with "Every visible heading, control, and
status line earns its space."). It ends with the paragraph about Sheets
("Sheets are `components/sheet`, …web needs the Modal fallback."). The next
section is `## Long lists`. Read both sections in full before Step 2; every
sentence in them moves to `DESIGN.md` unchanged in meaning.

After plans 047 and 048:

- `ButtonVariant` is `'log' | 'primary' | 'quiet' | 'ghost'`
  (`src/components/button.tsx`). `primary` is the default. `pressed` on
  `quiet` or `ghost` turns the label and glyph accent.
- `src/lib/theme-color/tokens.ts` exports `THEME_COLOR_TOKENS`, the 25
  `--color-*` names in `src/global.css`. `src/lib/theme-color/tokens.test.ts`
  checks them against the CSS.
- Lint rejects `border-border/NN` and `bg-black/NN` (`shinobu/no-adhoc-tints`).

How the repo uses each token today (the role column below is the rule; it was
read from the call sites):

| Token | Role |
|---|---|
| `background` | The screen behind everything. |
| `surface` | Anything raised on `background`: cards, fields, sheets, poster placeholders. |
| `foreground` | Body text and glyphs. |
| `muted` | Secondary text: meta lines, captions, placeholders, disabled labels. Never a paragraph of body copy. |
| `border` | Control outlines (quiet buttons, fields) and dividers. |
| `hairline` | The edge around a poster, still, or nested card. |
| `accent` | Red for links, a selected toggle, the caret, and other small marks. Never a filled button. |
| `accent-foreground` | Text and glyphs on a solid `accent` fill. |
| `accent-tonal` / `accent-on-tonal` | A soft red background (an accent badge, an error toast) and the text on it. |
| `log` / `log-foreground` | The log action and its confirm and retry, nothing else (`shinobu/log-color-only`). |
| `success` / `success-tonal` | A confirmed write: its glyph or text, and its soft background. |
| `scrim` / `on-scrim` | The dark layer under text on an image, and that text (also text over a poster gradient). |
| `toast-surface` / `toast-shadow` | Toasts and web tooltips only. |
| `logo-tile` | The light tile behind a TMDB company logo, in both themes. |
| `preview-light*` / `preview-dark*` | Only the theme picker's preview swatches (`src/features/settings/theme-picker.tsx`). |

Type roles in use (each is a shared component; use the component, not its
classes):

| Role | Component | Classes it applies |
|---|---|---|
| Sheet or notice title | `SheetHeader`, `CenteredNotice.Title` | `font-display text-2xl text-foreground` |
| Section title | `Section` | `font-display text-xl text-foreground` |
| Compact header title | `ScrolledTitle` | `font-display text-lg text-foreground` |
| Overline | `Eyebrow` | `font-sans-semibold text-xs uppercase tracking-wider` |
| Field label | `FieldLabel` | `text-foreground font-sans-semibold text-sm` |
| Secondary line | `MetaLine` | `text-muted font-sans text-sm` |
| Body | plain `Text` | `font-sans text-sm text-foreground` |
| Caption | plain `Text` | `font-sans text-xs text-muted` |

The destructive pattern the repo follows (after plan 047): the entry point is
`variant="quiet"` with `icon={<Button.Icon name="trash-outline" />}`
(`src/features/lists/delete-list.tsx:90`), and its confirm step is the default
`primary` with the same icon (`src/features/lists/delete-list.tsx:50`).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `bun install`    | exit 0 |
| Tests     | `bun test src/lib/theme-color` | all pass |
| All tests | `bun test`       | all pass |
| Lint      | `bun lint`       | exit 0 |
| Typecheck | `bun typecheck`  | exit 0 |

## Suggested executor toolkit

- Write in ASD-STE100 Simplified Technical English. Short
  sentences, active voice, one idea per sentence, no filler, no em-dash chains.
  `AGENTS.md` is written this way. Match it.

## Scope

**In scope**:

- `DESIGN.md` (create, repo root)
- `AGENTS.md` (remove two sections, add a pointer)
- `CLAUDE.md` (add one import line)
- `src/lib/theme-color/tokens.test.ts` (add one test)

**Out of scope**:

- Any source file under `src/` other than `tokens.test.ts`. If writing the doc
  shows a rule the code breaks, list it under NOTES in your report. Do not fix it.
- Per-component `.md` files. One file is the design.
- Other `AGENTS.md` sections (Long lists, Loading and error states, and so on).

## Git workflow

- One commit: `docs(design): add DESIGN.md with token, component, and variant rules`
- End the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Write DESIGN.md

Create `DESIGN.md` with these sections, in this order. Target 120–180 lines.
Every rule must be specific enough to check; "use sparingly" is not a rule.

1. `# Shinobu design system` and one paragraph: read this before you add or
   restyle UI; if this file and the code disagree, the lint rules and types
   win and this file is the bug.
2. `## Tokens`: one paragraph (colors are role tokens in `src/global.css`,
   declared for light and dark; a class uses a token, a string color goes
   through `useThemeColor` with a `ThemeColorToken`). Then the token role table
   above, with every token by its full name (`--color-hairline`, and so on;
   list each `preview-*` token by name, not with a wildcard). Then one
   correct/incorrect pair:

   ```tsx
   // Correct: the role token.
   <View className="rounded-lg border border-hairline" />
   // Incorrect: an alpha guess on another role. Lint rejects it.
   <View className="rounded-lg border border-border/50" />
   ```

   End the section with: adding a role means a token in both blocks of
   `global.css`, an entry in `src/lib/theme-color/tokens.ts`, and a row here.
3. `## Typography`: the type-role table above, then the font rules moved from
   AGENTS.md (Space Grotesk titles, Inter body, never `font-bold` or
   `font-semibold` with a custom font, add a weight token instead, the 忍 kanji
   uses the OS font). One correct/incorrect pair: `<Section>` title vs a
   hand-written `<Text className="font-display text-xl">` section heading.
4. `## Pick a component`: a table "You need → Use → Not". Cover: an action
   (`Button`, not a pressable with `Text`); a floating action (`Fab`); a row
   that navigates or has a subtitle (`ActionableRow`); a tappable card
   (`PressableCard`); a short horizontal row (`Rail`); a data list (`List`,
   not `FlatList` or `ScrollView` with `map`); a modal (`Sheet`, not `Modal`
   or `@gorhom/bottom-sheet`); a loading block (`Skeleton` inside
   `SuspenseSection`, not `if (isLoading)`); a full-screen empty or error
   state (`CenteredNotice`); text input (`TextField`, `SearchField`); a
   two-to-four way choice (`SegmentedControl`); an image (`Image` from
   `@/components/image`); text that changes from user state (`MorphText`).
   Before you write each row, open the component file in `src/components/`
   and confirm it exists and fits the row. Drop a row whose component does
   not exist.
5. `## Button`: the variant table:

   | Variant | Use it for | Count per view |
   |---|---|---|
   | `log` | Logging, and its confirm and retry. Lint allows it only on log paths. | — |
   | `primary` (default) | The one main action of a sheet step or a notice: confirm, save, open settings. | At most one per sheet step or notice. |
   | `quiet` | Every other framed action: secondary actions, a destructive entry point, a toggle. Most buttons are `quiet`. | Any |
   | `ghost` | A frameless action in a dense row, header, or toolbar, usually `iconOnly`. | Any |

   Then: these four are the only variants; `outline`, `destructive`,
   `secondary`, `danger`, and `link` do not exist and fail typecheck. A toggle
   is `quiet` or `ghost` with `pressed`. A destructive action is `quiet` with
   `trash-outline`, and its confirm step is `primary` with `trash-outline`;
   never red. Then two correct/incorrect pairs: (a) the destructive pair, and
   (b) a like toggle (`<LikeButton>` or `<Button variant="quiet" pressed={liked}>`)
   vs inventing an accent variant. Then the Button rules moved from AGENTS.md
   (icon from `Button.Icon`'s docblock, `loading`, `morphLabel`, `className`
   is layout only, add a prop when a shape is missing).
6. `## Interaction and layout`: move the rest of AGENTS.md's "Class names and
   buttons" section here: every element earns its space, `cn()` for
   classes, `pressBehavior="immediate"` for disclosures, platform variants
   with `ios:`/`android:`/`web:`, FAB sizes, shapes, and variants, `MorphText`,
   and Sheets. Keep each rule's meaning; shorten wording only.
7. `## Color rules`: move the rest of "Theming and typography": `accent`
   is `#DC2626`, solid red only for logging (`--color-log`, `variant="log"`),
   other primary actions are neutral, keep the red loading logo and softer red
   tints, `shinobu/log-color-only`, dark is the designed mode but light must
   render, `useThemeColor` for string colors and the `${background}00`
   exception with its `docs/solutions/` link.

**Verify**:
- `wc -l DESIGN.md` → between 100 and 200.
- `grep -c "^## " DESIGN.md` → `6` (sections 2–7).
- `grep -nE "variant=\"(outline|destructive|secondary|danger|link)\"" DESIGN.md`
  → only inside the "Incorrect" half of an example or the sentence that says
  they do not exist.

### Step 2: Move the sections out of AGENTS.md

Delete `## Theming and typography` and `## Class names and buttons` (from each
heading up to the next `## ` heading) from `AGENTS.md`. In their place add:

```md
## Design system

`DESIGN.md` holds the visual rules: tokens, type, which component and which
`Button` variant to pick, with correct and incorrect examples. Read it before
you add or restyle UI. A rule it states that lint or types can enforce is
enforced there.
```

Check that every sentence you deleted has a home in `DESIGN.md`:
`git diff AGENTS.md` and read each removed line against the new file.

Add `@DESIGN.md` as a new last line of `CLAUDE.md`.

**Verify**:
- `grep -n "^## Theming\|^## Class names" AGENTS.md` → no output.
- `grep -n "^## Design system" AGENTS.md` → one line.
- `tail -1 CLAUDE.md` → `@DESIGN.md`.

### Step 3: Keep the token table honest

Append to `src/lib/theme-color/tokens.test.ts`:

```ts
test('DESIGN.md gives every token a role', () => {
  const design = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8');
  expect(THEME_COLOR_TOKENS.filter((token) => !design.includes(`\`${token}\``))).toEqual([]);
});
```

Fix the relative path if it does not resolve to the repo root; do not change
the assertion.

**Verify**:
- `bun test src/lib/theme-color` → 2 pass.
- Mutation check: copy `DESIGN.md` to `/tmp/DESIGN.md.bak`, delete the
  `--color-hairline` row, run the test → fails; copy it back, rerun → passes.
  Never use `git stash`.

### Step 4: Gates

`bun typecheck`, `bun lint`, `bun test` → all exit 0.

## Test plan

One added test in `tokens.test.ts` (Step 3). No other test.

## Done criteria

- [ ] `DESIGN.md` exists, 100–200 lines, 6 `## ` sections
- [ ] `AGENTS.md` has `## Design system` and neither moved heading
- [ ] `tail -1 CLAUDE.md` prints `@DESIGN.md`
- [ ] `bun test src/lib/theme-color` → 2 pass
- [ ] `bun typecheck`, `bun lint`, `bun test` exit 0
- [ ] Changed files: only `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `src/lib/theme-color/tokens.test.ts`

## STOP conditions

- The precondition fails (plans 047 or 048 not in the branch).
- A token from `THEME_COLOR_TOKENS` has no role in the table above and its
  call sites do not make the role clear. Report it; do not invent a role.
- A sentence in the moved AGENTS.md sections contradicts the Button rules
  above (for example, it names a removed variant). Report it.

## Maintenance notes

- `DESIGN.md` is the place to fix a hole an agent falls into. When an agent
  builds a screen wrong, fix the rule here (or the lint rule) instead of
  correcting that one screen.
- The token test fails when a token lands without a row. The Button variant
  table has no test; `ButtonVariant` changes are rare and reviewed.
