# Reanimated `exiting` on web pulls the element out of its flex flow

**Symptom (2026-09-10).** Closing the card actions sheet on web showed, for a
couple of frames at full opacity, the log button's eye icon jammed flush
against "Episode 11 not yet aired" with no gap, before the sheet faded. It
read as the buttons "mushing together" on open/close.

## Cause

On web, Reanimated runs an `exiting` animation by cloning the element,
moving its children into the clone, appending the clone to the parent and
giving it `position: absolute` at the element's last rect
(`layoutReanimation/web/componentUtils.ts`). That happens for every element
with `exiting` in an unmounting subtree, not only the one the unmount targets.
`components/button` gave its icon slot an exit fade, so when the sheet's
panel unmounted the icon left the button's `flex-row` while the label was
still laid out: `justify-center` recentered the label as if the icon and gap
were gone, and the absolutely positioned icon stayed where it was, now
touching the text. The sheet's own exit fade then ran over that layout.

Native animates the frame in place; only the web implementation reparents.

## Fix

`components/button` applies its slot `exiting` only off-web, the same
platform split its box `layout` already uses
(`reanimated-web-layout-transition-scales-text.md`). The icon and spinner
still fade in on web; they drop out without a fade.

Rule of thumb: on web, give `exiting` only to elements whose removal from
the flow can't shift a sibling, i.e. absolutely positioned ones or the sole
child of their parent. A row item inside a surface that itself exits is the
case that bites.
