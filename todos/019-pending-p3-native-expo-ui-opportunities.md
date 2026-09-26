---
status: pending
priority: P3
---

# Native Expo UI opportunities from the 2026-09-26 sweep

A source-only audit against the installed `@expo/ui` 57.0.19, following
`018-done-p3-animation-opportunities.md`. Items are ordered by usefulness and
confidence. Item 4 was tried on iOS and reverted after device validation;
the other items remain unimplemented. Paths below start at `src/` unless
otherwise stated.

## 1. Reuse native segmented controls for filmography

- [ ] Move the existing native `SeasonTabs` implementations into the shared
  `components/segmented-control/` directory and use them for filmography's
  Format control in `features/credit-timeline/credit-timeline.tsx:347`.

Filmography still uses the 206-line custom control with measured widths,
duplicated labels and a sliding selection mask. Seasons already use Expo's
community segmented control on iOS and a themed Compose
`SingleChoiceSegmentedButtonRow` on Android. Reuse those implementations rather
than add another native wrapper. Keep the current custom implementation as
`index.web.tsx`, where the season pager needs continuous `progress`.

Preserve `size="sm"`, per-option spoken labels, controlled selection and the
single selection haptic. Verify the three Format labels fit the existing
`w-52` container at larger text sizes. Native season selection already updates
when a swipe settles, so this extraction should preserve that behavior.

## 2. Use anchored native menus for short filter pickers

- [ ] Start with filmography's Role picker, then migrate the watchlist tracker
  filter and search scope picker through the same shared menu wrapper.

Today these open `components/picker-sheet.tsx` for a single choice:

- `features/credit-timeline/role-sheet.tsx:23` and its trigger in
  `features/credit-timeline/credit-timeline.tsx:360`.
- `features/watchlist/watchlist-toolbar.tsx:159`.
- `app/(tabs)/search.tsx:655-687`.

Use `MenuView` from `@expo/ui/community/menu`, with stable action IDs and
`state: 'on'` for the selected entry. It provides a SwiftUI menu on iOS and a
Compose dropdown on Android. There is no `Menu` export from the installed
`@expo/ui` root. Retain the existing picker sheet on web.

The native wrapper must own the trigger. This is not a swap inside the existing
`open`/`onClose` sheet API: iOS cannot open this menu programmatically and does
not fire `onOpenMenu` or `onCloseMenu`. Check interaction with the existing
pressable before sharing the wrapper. In search, verify opening while the
keyboard is visible, since the current trigger dismisses it before opening.

Include role counts and watchlist counts in menu titles. Preserve `46+` as a
lower bound and its spoken "46 or more" meaning. Preserve the watchlist's
separate one-tap clear action. Menu icons accept SF Symbols on iOS and image
sources on Android, not arbitrary `ProviderIcon` children. Provider names must
remain sufficient to identify an option.

## 3. Replace hand-drawn provider checkboxes

- [ ] Replace `ProviderToggle` in `features/write-sheet/provider-picker.tsx:36`
  with an Expo UI `Checkbox` under a `Host`, keeping the existing selected set
  and callbacks.

Each row currently implements a checkbox with a pressable, two stacked glyphs
and an animated selection background. `Checkbox` already exposes `value`,
`onValueChange`, `label` and `disabled`. On iOS it renders a SwiftUI `Toggle`;
on Android it renders a checkbox. Accept that platform-specific appearance.

Keep provider identity visible and announce "Write to [provider]". Use
`RNHostView` if retaining the RN provider icon inside the native layout. Make
one control own each toggle, so tapping its label or indicator changes selection
exactly once. All/None must update every control. The shared list is used by
both logging and watchlist writes; its selection must not initiate a write.

Keep the web implementation initially. Its role workaround is documented in
`docs/solutions/web-pressto-accessibility-role-kills-onpress.md`; adding
`role="checkbox"` to its existing pressable would break it.

## 4. Use native disclosures for connection instructions

- [ ] Give `components/collapsible.tsx` a native implementation using
  `Host` and `Collapsible` from `@expo/ui`.

The first implementation put the RN instruction body in an `RNHostView`
with `matchContents` inside Expo UI's native `Collapsible` and a vertically
content-sized `Host`. On iOS, the collapsed header appeared, but expanding
Trakt produced a tall blank region with clipped, horizontally displaced text;
the instructions were unusable inside the setup sheet. That implementation
was reverted in PR #159. Do not repeat this `RNHostView` layout without a
device-tested fix. A future attempt must preserve usable long instructions,
link presses, light/dark colors, larger text and spoken disclosure state on
both native platforms, as well as existing web behavior. The current shared
React Native disclosure remains in `components/collapsible.tsx`.

Do not extend this change to season accordions or virtualized diary groups;
those headers carry progress, actions and list-specific behavior.

## 5. Try a native year picker before replacing the grid

- [ ] Prototype Expo UI `Picker` for
  `features/anime-seasons/year-sheet.tsx:14` and compare distant-year selection
  on iOS and Android before committing to it.

The current sheet builds a pressable for every year. `Picker.Item` supports
numeric values, so `selectedValue` and `onValueChange` can use the existing
year directly. An iOS wheel can live inside the existing `Sheet`; Android's
universal picker is a dropdown even when `appearance="wheel"` is requested.

This is lower confidence than the short menus. The grid was chosen to make a
decade jump quick, and a long dropdown or wheel might be slower. Preserve the
min/max bounds, previous/next arrows and current selection on reopening. Keep
the grid if the native control makes distant years harder to reach.

## Considered and rejected

- Sheet replacement. `components/sheet/index.tsx` already uses a native sheet
  library, and AGENTS.md explicitly requires it. Keep its keyboard and detent
  fixes, including `docs/solutions/bottom-sheet-content-detent-clips-tall-content.md`.
- Whole-app native buttons. `components/button.tsx` owns loading, icon slots,
  morphing labels and variants used throughout the app. A bulk replacement
  would require rebuilding that contract around another button.
- Text fields. `components/text-field.tsx` already wraps a native RN input.
  Expo UI's `TextInput` takes `ObservableState<string>` rather than the current
  string value and has different event signatures. Removing a focus-border
  animation does not justify changing all the form bindings.
- Native grouped lists for the Connect screen. Most content is provider cards
  and forms, not simple settings rows. Hidden items are an unbounded collection.
  Expo UI `List` is not a replacement for the app's virtualized `components/List`.
- Card and episode action sheets as context menus. These show artwork, fetched
  metadata, watch history and in-place write flows. Plain menu actions cannot
  preserve that content.
- Date selection, notification switches, grid/list toggles and season tabs.
  These already use Expo UI. Keep their platform wrappers and the Android date
  boundary fix in `docs/solutions/android-date-picker-day-before.md`.

## Implementation checks

Use directory-based platform variants and keep imports behind app components.
For each item, check iOS, Android and the existing web behavior, including
light/dark mode, larger text and spoken selection state. Run `bun typecheck`,
`bun lint`, `bun check:classnames`, `bun check:router-push` and `bun check:links`
after implementation.

The package is already installed. These JS/TS changes should hot reload in a
dev client built with the current dependencies. A package or native config
change would require `bun ios.clean` / `bun android.clean`. This todo alone
needs no rebuild.
