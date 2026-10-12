---
status: in-progress
priority: P3
---

# Native Expo UI opportunities from the 2026-09-26 sweep

A source-only audit against the installed `@expo/ui` 57.0.19, following
`018-done-p3-animation-opportunities.md`. Items are ordered by usefulness and
confidence. Item 4 was tried on iOS and rejected after device validation.
The watchlist tracker and anime year menus are implemented (2026-10-12);
remaining opportunities are tracked below. Paths start at `src/` unless otherwise
stated.

## 1. Reuse native segmented controls for filmography

- [ ] Move the existing native `SeasonTabs` implementations into the shared
  `components/segmented-control/` directory and use them for filmography's
  Format control in `features/credit-timeline/credit-timeline.tsx:347`.

Filmography still uses `components/segmented-control.tsx`, a shared custom
control with a sliding selection mask and optional pager `progress`. Seasons
already use Expo's community segmented control on iOS and a themed Compose
`SingleChoiceSegmentedButtonRow` on Android. Reuse those implementations rather
than add another native wrapper. Move the current custom implementation to
`index.web.tsx`, where the season pager needs continuous `progress`.

Preserve `size="sm"`, per-option spoken labels, controlled selection and the
single selection haptic. Verify the three Format labels fit the existing
`w-52` container at larger text sizes. Native season selection already updates
when a swipe settles, so this extraction should preserve that behavior.

## 2. Use anchored native menus for short filter pickers

- [x] Migrate the watchlist tracker filter to the shared native menu wrapper.
- [ ] Migrate filmography's Role picker and the search scope picker.

The remaining controls open `components/picker-sheet.tsx` for a single choice:

- `features/credit-timeline/role-sheet.tsx:23` and its trigger in
  `features/credit-timeline/credit-timeline.tsx:360`.
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

**Implemented:** `components/native-picker-menu/` uses the community `MenuView`
on iOS and Compose `DropdownMenu` on Android. The Android leading icon slot
hosts `ProviderIcon` through `RNHostView`, keeping the full-color logos at 16
points without raster conversions or adapter tinting. iOS shows provider names
without logos because the adapter accepts only SF Symbols. Counts are
parenthesized (`AniList (2)`), with partial counts spelled out (`Simkl (46 or
more)`). Native menus show the selected option; the separate clear-filter
action and web sheet are unchanged. See
`docs/plans/0074-native-filter-and-year-menus.md`.

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

## 4. Native connection disclosures — rejected

Do not replace `components/collapsible.tsx` with Expo UI `Host` and
`Collapsible` for the connection instructions. Keep the shared React Native
disclosure on iOS, Android and web.

The first implementation put the RN instruction body in an `RNHostView`
with `matchContents` inside Expo UI's native `Collapsible` and a vertically
content-sized `Host`. On iOS, the collapsed header appeared, but expanding
Trakt produced a tall blank region with clipped, horizontally displaced text;
the instructions were unusable inside the setup sheet. That implementation
was reverted in PR #159. This approach is rejected, not a pending implementation
check. Any different proposal would need to demonstrate usable long instructions,
link presses, light/dark colors, larger text and spoken disclosure state on
both native platforms, as well as existing web behavior.

Do not extend this change to season accordions or virtualized diary groups;
those headers carry progress, actions and list-specific behavior.

## 5. Native year selection — implemented

- [x] Use an anchored native year menu in
  `features/anime-seasons/season-picker.tsx`, sharing `NativePickerMenu` with
  the watchlist filter. Preserve the year grid on web.
- [ ] Compare distant-year selection, larger text and screen-reader interaction
  on iOS and Android.

The chosen implementation uses the same native menus as the tracker filter,
not a wheel or a native sheet. Years are newest first, retain the existing
min/max bounds, and show the current selection. Previous/next arrows are
unchanged. The web sheet still builds its grid of years. Distant-year usability
remains to be checked; restore the native grid if the long menu makes it worse.

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

User screenshots confirm the tracker menus render on iOS and Android,
including Android logos. The user also reported Android's native-stack warning
that `(tabs)` was removed natively but remained in JS state. No app
`beforeRemove` listener was found, and the warning has not been reproduced or
attributed to the menus. Track its reproduction separately rather than adding
`usePreventRemove` without a removal-prevention requirement.

The package is already installed. These JS/TS changes should hot reload in a
dev client built with the current dependencies. A package or native config
change would require `bun ios.clean` / `bun android.clean`. This todo alone
needs no rebuild.
