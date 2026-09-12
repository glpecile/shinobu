# Cmd-click on a card navigated in place instead of opening a tab

## Symptom

(owner, 2026-09-12.) On web, cmd-clicking a media card — or the card sheet's
**View details** — navigated the current tab, the way a plain click does.
Every other link-shaped thing in a browser opens a second tab.

## Cause

Nothing in the press path knows about the modifier, and nothing in the page is
a link:

- the app's pressables are `components/presstable` → pressto → gesture-handler's
  `BaseButton`, which renders a view, so the browser has no anchor to apply its
  own cmd-click behaviour to;
- pressto reports a press as `onPress(options)` — its own options object, with
  no DOM event behind it — so `metaKey` never reaches a handler either.

## Fix

`lib/navigation/new-tab.ts` records whether the last `pointerdown` on the
document carried cmd/ctrl (capture phase: gesture-handler stops propagation on
the targets it claims), and `usePushRoute` opens the href in a new tab instead
of pushing when it did. One guard in the resource every press-driven
navigation already funnels through — cards, rows, person rails, sheet
actions — so no call site changed. The recorded modifier expires after a
second, which is what stops a cmd-click from leaking into the *next* press
(a keyboard activation has no pointerdown of its own).

Not covered, for want of a real anchor: middle-click, the context menu's "Open
link in new tab", and the browser's hover status bar. Those need the pressables
to render `<a href>` on web, which is a larger change than the report asked
for.

## Rule

A gesture library's press is not a click. When web behaviour depends on the
DOM event — modifiers, buttons, keyboard state — read it from the event stream
directly and keep that read in the one navigation helper, not at call sites.
