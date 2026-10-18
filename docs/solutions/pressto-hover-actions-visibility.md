# Keep hover action visibility outside Pressto's animated opacity

`PresstableOpacity` supplies an inline animated opacity of 1 at rest. A web
`opacity-0` class on that pressable loses to its inline style, so permanently
mounted hover actions appear continuously even while their pointer events are
disabled.

Put visibility on a nonanimated enclosing `View`; leave press feedback on the
inner button. Keep the button mounted and focusable, and reveal the wrapper
when its child receives focus. Removing the button at rest, or using
`visibility: hidden`, prevents keyboard users from reaching it. The wrapper
also owns pointer events while hidden, and the button supplies a visible focus
outline. Native editable-list controls stay visible.

Verified with live Chromium on 2026-10-18: grid and row action wrappers have
opacity 0 at rest. Tabbing from a poster or row reaches its More options button,
reveals its wrapper at opacity 1, and Enter opens the actions sheet.
