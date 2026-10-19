# Haptic opportunities

Status: implemented, 2026-10-19.

## Existing feedback

`src/lib/haptics/index.ts` already defines the complete vocabulary needed for this pass. `selection()` uses Pulsar's system selection preset, `confirm()` uses a medium impact, and `success()` / `error()` use system notification presets. The web implementation is deliberately silent.

Tabs, segmented controls, native picker menus, picker-sheet selection, FABs, likes, watchlist openers, card action sheets, log-sheet opening, and write confirmation already have feedback. Native pagers emit a selection tick on a changed settled page. `src/lib/toast/index.ts` owns success/error haptics for toasts. Result sheets separately emit errors when they stay visible. New feedback must not duplicate these owners.

The report follows the animation-opportunities approach: inspect the existing vocabulary, gate candidates, specify recipes, and explain rejections. Unlike animation, a frequent discrete selection can still benefit from a light tick. [Android's guidance](https://developer.android.com/develop/ui/views/haptics/haptics-principles) supports matching feedback strength to frequency and importance, and assigning consistent feedback to similar interactions. The choices below are Shinobu recommendations based on that guidance and the current source.

## Recommended additions

Frequency estimates are qualitative, not measured analytics. Each recipe uses the existing wrapper and emits once per accepted event.

| Priority | Location and current behavior | Purpose and frequency | Recipe and owner | Guard and platform considerations |
| --- | --- | --- | --- | --- |
| 1 | `src/features/episode-details/episode-sections.tsx`. The floating **View series** button pushes the parent series without feedback. `EpisodeHeading` has equivalent series links too. | Acknowledge deliberate navigation out of the episode context. Occasional. This is the control in the supplied screenshot. | One `haptics.selection()` when an explicit series navigation is accepted. Cover the heading links with the same policy. | Preserve `usePushRoute` and emit only after its route guard accepts the push. Keep any feedback support opt-in for these callers, not global for every route. No confirm/success pulse for navigation. Web remains silent. |
| 2 | `src/features/episode-details/episode-sections.tsx`. Previous/Next call `go()` without a tick. Native `step()` in `screen/index.tsx` commits route parameters immediately; only `settleAt()` explicitly emits haptics. | Confirm the chosen episode step. Repeated while browsing episodes. | One `haptics.selection()` for a valid, enabled arrow press. Keep the existing tick for a changed page reached by a swipe. | Own the new tick in the explicit arrow action, not `useGoToEpisode` or the shared `step()` function: those also serve automatic advance after logging. Ensure the tap's eventual settle does not emit a second tick. First/last disabled arrows and same-page swipes stay quiet. Web keys remain silent. |
| 3 | `src/features/write-sheet/provider-picker.tsx`. `ProviderOptions` routes individual toggles and All/None directly to callbacks. No haptic is provided here or by the log/watchlist selection callbacks. | Confirm changes to the actual write destinations. Several changes per edited log or watchlist operation. | One `haptics.selection()` in the shared options action for each provider toggle. All/None gets one tick for the entire changed set. | No tick when All/None would leave the selection unchanged. Add it once in the shared picker, covering both `ProviderPicker` and `ProviderToggleList`. Do not add another pulse in each sheet. Existing `confirm()` still means the later write. |
| 4 | `src/features/log-media/tag-picker.tsx`. Selecting/removing a suggested tag changes the text field and checkmark without tactile feedback. | Confirm a discrete tag selection. Several per log when used. | One `haptics.selection()` in the chip-toggle press path, alongside `onChange(toggleTag(value, tag))`. | Do not place it in `onChange` for the whole field. Typing, suggestions arriving, filtering, chip entrances, and Show more/less stay quiet. Chips are local choices, not completed provider writes. |
| 5 | `src/components/view-toggle/index.android.tsx`. Switching between grid and list calls `onChange(next)` without a tick. The iOS segmented Picker also had no explicit haptic. | Confirm a layout selection, consistent with the existing format/season segmented controls. Occasional. | Android: one `haptics.selection()` in the layout-switch press. iOS: one `haptics.selection()` on a changed selection, as `NativeSegmentedControl` already does for the same SwiftUI Picker. | Re-selecting the current layout must be quiet; web stays silent. |
| 6 | `src/features/trackers/provider-cards-section.tsx`. `openSheet()` presents tracker setup/session controls without feedback, unlike card action and watchlist sheet openers. | Acknowledge entering a tracker action sheet. Occasional. | One `haptics.selection()` in `openSheet()` when a user press opens the sheet, including the reconnect-banner path, and on a card's direct Connect press so a card's Connect ticks whether or not it opens a sheet. | Emit for the opening action, not sheet mounting, session hydration, auto-close, or dismissal. Keep direct OAuth connection results with the existing root connect toast. |
| 7 | `src/features/trackers/provider-sheet.tsx`. Disconnect clears the local session and closes the sheet without feedback. `useDisconnectProvider()` supplies no haptic or toast. | Acknowledge a committed session change. Rare. | One `haptics.confirm()` in the accepted Disconnect press, immediately before `disconnect(id)`. | Keep this in the UI handler, not the session store. Do not add success/error notification pulses or a new toast solely for haptics. It does not imply deleting anything from the provider. |

## Deliberately quiet or already covered

- **Every Button, card, Back, and generic route push:** rejected at meaning/frequency. Adding a default pulse in `Button`, `PresstableOpacity`, or `usePushRoute` would make ordinary browsing noisy and duplicate caller-owned feedback. Contextual series navigation earns an explicit opt-in.
- **Log, watchlist, list-membership, and connection results:** rejected at ownership. Confirm handlers and toast/result owners already cover these. `src/app/_layout.tsx` supplies the successful connection toast. Do not add another result haptic beside it.
- **Typing, continuous scroll, loading, and automatic episode advance:** rejected at timing and meaning. A state change caused by query resolution or an automatic next step is not a new user selection.
- **Pull-to-refresh and native notification switches/date pickers:** deferred at ownership. Inspect native/system feedback on hardware first. Tab double-tap refresh also inherits tab-press feedback, so a generic refresh pulse risks doubling it.
- **Disclosure expansion and sharing:** rejected for this pass at meaning/ownership. A chevron, text expansion, or native share presentation does not need another tick merely because it animates. Clipboard fallback already reports success through the toast wrapper.

## Suggested implementation order

Start with View series and explicit episode arrows, then provider selection and tag chips. These address deliberate controls with observable feedback gaps. Follow with the layout switch and tracker actions.

## Verification for implementation

- Check on physical iPhone and Android hardware that each accepted event feels subtle and emits once. Source inspection cannot establish actuator feel, native feedback overlap, or settings behavior.
- For series navigation, test both the floating button and heading links, including rapid repeats blocked by the route guard.
- For arrows, test enabled/disabled ends, a swipe to a different page, a cancelled swipe, and log-driven automatic advance. Repeat with reduced motion enabled. Motion preferences must not accidentally remove or duplicate explicit-action feedback.
- For provider selection, test a single toggle, changed All/None, unchanged All/None, and the frozen pending-write state in both log and watchlist sheets.
- For tags and layout, test add/remove, text entry, asynchronous suggestions, changed layout, and unchanged layout. Verify no second native pulse before enabling manual iOS Picker feedback.
- For tracker actions, test opening/reconnecting, sheet auto-close, dismissing, and Disconnect. Confirm successful connection still emits only its existing toast result feedback.
- Verify haptic settings and unsupported hardware behavior without overriding system preferences. Web must continue to navigate and select normally with its no-op wrapper.

The recipes use the installed Pulsar wrapper, so they hot reload; no native rebuild is needed.
