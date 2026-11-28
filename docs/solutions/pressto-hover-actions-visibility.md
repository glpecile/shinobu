# Keep hover action visibility outside the pressable's opacity

`PresstableOpacity` owns its own opacity. On native, pressto writes an animated
inline opacity of 1 at rest. On web, `components/presstable/index.web.tsx`
writes an inline opacity of 0.5 while pressed. A visibility class or style on
that pressable fights its press feedback: with pressto 0.7 on web, an
`opacity-0` class lost to the inline 1, so permanently mounted hover actions
appeared continuously even while their pointer events were disabled.

Put visibility on an enclosing `View` (`OverlayActionsButton`), and show it from
`usePointerHover` on the card's wrapper, not from pressable hover props. Leave
press feedback on the inner button. Keep the button mounted and focusable, and reveal the wrapper
when its child receives focus. Removing the button at rest, or using
`visibility: hidden`, prevents keyboard users from reaching it. The wrapper
also owns pointer events while hidden, and the button supplies a visible focus
outline. Native editable-list controls stay visible.

Verified with live Chromium on 2026-10-18: grid and row action wrappers have
opacity 0 at rest. Tabbing from a poster or row reaches its More options button,
reveals its wrapper at opacity 1, and Enter opens the actions sheet.
