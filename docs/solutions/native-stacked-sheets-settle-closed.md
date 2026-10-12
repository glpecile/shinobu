# Two native bottom sheets can't co-present — the second dies silently

**Symptom (2026-10-12).** The card-actions sheet's "Log episode 1" button did
nothing on native (Android and iOS) while the same button on the details
screen — and the web card sheet — opened the log form. The regression came
from plan 0068 (#203): the log trigger used to own its confirm sheet locally,
and now opens the app-level `CatchUpLogSheet` session, so from a card the tap
co-presents two `ModalBottomSheet`s (`@swmansion/react-native-bottom-sheet`).

## Cause

Without `nativeOverlay` (reverted in hotfix 0.6.1 — it kills pressto presses
on Android), a second native sheet opened over a first never becomes visible.
Worse, it settles at detent 0, and `components/sheet`'s `onSettle` maps
"settled at 0 while `open`" to `onClose` — which for the log session is
`closeCatchUp`, clearing the just-opened session. Net effect: the tap reads
as dead, and dismissing the first sheet reveals nothing behind it. Web RN
Modals stack, so only native is affected.

## Fix

Never stack: the incoming form renders **in place of** the host sheet's rows,
the watchlist picker's plan 0032 U3 shape. `LogConfirmSheet`/`CatchUpSession`
split into sheet-agnostic forms (`LogConfirmForm`, `CatchUpForm`,
`LogSheetContent`) plus thin app-level drawer hosts; the card-actions sheet
grew a `log` mode rendering `LogSheetContent`, fed by `LogMediaButton`'s
`onOpenRequest` interception (and the completion offer's, one step deeper).
Cancel returns to the rows; a clean report toasts and returns to the rows,
matching the pre-0068 nested-sheet UX.

## Inline session lifetime

The host resets its chosen mode when visibility or item identity changes, so
reopening the same card starts at the action rows. A Letterboxd completion
request can name a different film ID from its originating series; the host's
mode owns the session, not equality with that follow-up ID.

Unmounting the episode form marks its visibility ref false in effect cleanup.
Outstanding writes then report through dismissed-session toasts rather than
an invisible ledger. The one-shot form uses the same visibility/unmount guard,
so a late movie result reports without invoking a retired host callback that
could reset a newly opened picker. `onDismiss` is separate from the form's `onClose`: the
"Connect one" navigation dismisses the entire host, while cancel and completion
return to its action rows.
