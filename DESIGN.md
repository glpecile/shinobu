# Shinobu design system

Read this file before you add or restyle UI. If this file and the code
disagree, the lint rules and types win, and this file is the bug.

## Tokens

Colors are role tokens in `src/global.css`, declared for light and dark. A class
uses a token, never hex. A color passed as a string, such as to an icon or
spinner, goes through `useThemeColor` from `@/lib/theme-color` with a
`ThemeColorToken`.

| Token | Role |
|---|---|
| `--color-background` | The screen behind everything. |
| `--color-surface` | Anything raised on `background`: cards, fields, sheets, poster placeholders. |
| `--color-foreground` | Body text and glyphs. |
| `--color-muted` | Secondary text: meta lines, captions, placeholders, disabled labels. Never a paragraph of body copy. |
| `--color-border` | Control outlines (quiet buttons, fields) and dividers. |
| `--color-hairline` | The edge around a poster, still, or nested card. |
| `--color-accent` | Red for links, a selected toggle, the caret, and other small marks. Never a filled button. |
| `--color-accent-foreground` | Text and glyphs on a solid `accent` fill. |
| `--color-accent-tonal` | A soft red background, such as an accent badge or an error toast. |
| `--color-accent-on-tonal` | The text on `accent-tonal`. |
| `--color-log` | The log action and its confirm and retry, nothing else (`shinobu/log-color-only`). |
| `--color-log-foreground` | Text and glyphs on `log`. |
| `--color-success` | A confirmed write: its glyph or text. |
| `--color-success-tonal` | The soft background of a confirmed write. |
| `--color-scrim` | The dark layer under text on an image. |
| `--color-on-scrim` | Text on `scrim`, and text over a poster gradient. |
| `--color-toast-surface` | Toasts and web tooltips only. |
| `--color-toast-shadow` | The shadow of toasts and web tooltips only. |
| `--color-logo-tile` | The light tile behind a TMDB company logo, in both themes. |
| `--color-preview-light` | Theme picker preview swatch only (`src/features/settings/theme-picker.tsx`). |
| `--color-preview-light-ink` | Theme picker preview swatch only. |
| `--color-preview-light-line` | Theme picker preview swatch only. |
| `--color-preview-dark` | Theme picker preview swatch only. |
| `--color-preview-dark-ink` | Theme picker preview swatch only. |
| `--color-preview-dark-line` | Theme picker preview swatch only. |

```tsx
// Correct: the role token.
<View className="rounded-lg border border-hairline" />
// Incorrect: an alpha guess on another role. Lint rejects it.
<View className="rounded-lg border border-border/50" />
```

Adding a role means a token in both blocks of `global.css`, an entry in
`src/lib/theme-color/tokens.ts`, and a row here.

## Typography

Titles use Space Grotesk (`font-display`). Body text uses Inter (`font-sans`,
`font-sans-semibold`). Each role below is a shared component. Use the
component, not its classes.

| Role | Component | Classes it applies |
|---|---|---|
| Sheet or notice title | `SheetHeader`, `CenteredNotice.Title` | `font-display text-2xl text-foreground` |
| Section title | `Section.Title` | `font-display text-xl text-foreground` |
| Compact header title | `ScrolledTitle` | `font-display text-lg text-foreground` |
| Overline | `Eyebrow` | `font-sans-semibold text-xs uppercase tracking-wider` |
| Field label | `FieldLabel` | `text-foreground font-sans-semibold text-sm` |
| Secondary line | `MetaLine` | `text-muted font-sans text-sm` |
| Body | plain `Text` | `font-sans text-sm text-foreground` |
| Caption | plain `Text` | `font-sans text-xs text-muted` |

React Native does not synthesize weights. Never pair `font-bold` or
`font-semibold` with a custom font. Add a weight token instead. The 忍 kanji
uses the OS font on purpose.

```tsx
// Correct: the shared component owns the type.
<Section>
  <Section.Header>
    <Section.Title>Cast</Section.Title>
  </Section.Header>
</Section>
// Incorrect: a hand-written section heading.
<Text className="font-display text-xl">Cast</Text>
```

## Pick a component

| You need | Use | Not |
|---|---|---|
| An action | `Button` | A pressable with `Text` |
| A floating action | `Fab` | A sized or reshaped `Button` |
| A row that navigates or has a subtitle | `ActionableRow` | A `Button` |
| A tappable card | `PressableCard` | A `View` with `onPress` |
| A short horizontal row | `Rail` | A horizontal `ScrollView` |
| A data list | `List` | `FlatList`, or `ScrollView` with `map` |
| A modal | `Sheet` | `Modal`, `@expo/ui` `BottomSheet`, `@gorhom/bottom-sheet` |
| A loading block | `Skeleton` inside `SuspenseSection` | `if (isLoading)` |
| A full-screen empty or error state | `CenteredNotice` | A hand-built centered `View` |
| Text input | `TextField`, `SearchField` | A bare `TextInput` |
| A two-to-four way choice | `SegmentedControl` | A row of `Button`s |
| An image | `Image` from `@/components/image` | React Native `Image` |
| Text that changes from user state | `MorphText` | `Text` |

## Button

Buttons are `components/button`. Pick the variant by the role of the action.

| Variant | Use it for | Count per view |
|---|---|---|
| `log` | Logging, and its confirm and retry. Lint allows it only on log paths. | Any |
| `primary` (default) | The one main action of a sheet step or a notice: confirm, save, open settings. | At most one per sheet step or notice. |
| `quiet` | Every other framed action: secondary actions, a destructive entry point, a toggle. Most buttons are `quiet`. | Any |
| `ghost` | A frameless action in a dense row, header, or toolbar, usually `iconOnly`. | Any |

These four are the only variants. `outline`, `destructive`, `secondary`,
`danger`, and `link` do not exist and fail typecheck. A toggle is `quiet` or
`ghost` with `pressed`. A destructive action is `quiet` with `trash-outline`.
Its confirm step is `primary` with `trash-outline`. Never make it red.

```tsx
// Correct: a quiet entry point, then a primary confirm.
<Button icon={<Button.Icon name="trash-outline" />} label="Delete list" onPress={openConfirm} variant="quiet" />
<Button icon={<Button.Icon name="trash-outline" />} label="Delete list" onPress={confirmDelete} />
// Incorrect: a variant that does not exist.
<Button icon={<Button.Icon name="trash-outline" />} label="Delete list" onPress={openConfirm} variant="destructive" />
```

```tsx
// Correct: a toggle is a quiet button with pressed (LikeButton wraps it).
<LikeButton label="Like" liked={liked} onChange={setLiked} />
// Incorrect: an accent variant for the selected state.
<Button icon={<Button.Icon name="heart" />} iconOnly label="Like" onPress={toggleLike} pressed={liked} variant="accent" />
```

- Every button has an `icon` from the list in `Button.Icon`'s docblock.
- An action that awaits passes `loading`.
- A label that changes from user state uses `morphLabel`.
- `variant`, `size`, and `align` set the look. Keep `className` to layout.
- When the button lacks a shape you need, add a prop to it.
- Cards, rows that navigate, and rows with a subtitle stay their own pressable.

## Interaction and layout

- Every visible heading, control, and status line earns its space. Do not render
  something because a provider or API exposes it. Do not repeat context the
  screen already shows. Give each intent one control.
- Compose every `className` with `cn()` from `@/lib/cn`, never a template
  literal, so a caller's class replaces the default instead of competing with it.
- Disclosures use `pressBehavior="immediate"` on `PresstableOpacity`,
  `PresstableScale`, `PressableCard`, or `ActionableRow`, so every press toggles.
  Other actions default to `prevent-repeat`, which drops repeat presses within
  500 ms. `shinobu/immediate-disclosures` enforces this for expanded
  accessibility states.
- Prefer Uniwind's `ios:`, `android:`, and `web:` variants for platform
  styling. Use platform files only when the implementation differs or a
  native-only import requires them. Do not split a component just to vary its
  classes.
- FABs use `components/fab`. Size is a fixed `size="sm"` (44) or `"md"` (56, the
  default) on every platform. Shape is `shape="squircle"` by default, with
  `"circle"` available. Color is independent: `variant="outline"` (default),
  `"filled"` (neutral), or `"log"` (red logging action). Never size, stretch, or
  reshape a FAB through `className`. It takes positioning and margins only. Use
  the same component for floating episode actions.
- `MorphText` animates text that changes from user state, like progress counts.
  Do not use it for static text or text that changes constantly.
- Sheets are `components/sheet`, over `@swmansion/react-native-bottom-sheet`.
  Do not swap it for `@expo/ui`'s `BottomSheet` or `@gorhom/bottom-sheet`. Both
  are native-only, and web needs the Modal fallback.

## Color rules

- `accent` is `#DC2626` in both themes.
- Reserve solid red action buttons for logging (`#DC2625`, `--color-log`,
  `variant="log"`), including its confirm and retry actions. Other primary
  actions are neutral.
- Keep the red loading logo and the existing softer red tints.
  `shinobu/log-color-only` enforces the logging button variant and rejects solid
  red control fills outside logging.
- Dark is the designed mode, but light must render correctly.
- A color passed as a string goes through `useThemeColor`. The exception is a
  composed color like `${background}00`. Comment it and lint-disable that line
  (`docs/solutions/web-prerender-bakes-js-resolved-colors.md`).
