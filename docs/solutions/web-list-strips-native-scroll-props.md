# Strip native scroll props from the web List

Legend List's web build renders its own `ListComponentScrollView` over a raw
`div`, not react-native-web's `ScrollView`. Unrecognized props are forwarded to
that element, where React warns about unknown DOM attributes.

`src/components/List/index.web.tsx` strips `keyboardShouldPersistTaps`,
`keyboardDismissMode`, `nestedScrollEnabled`, and `scrollEnabled` before forwarding props.
`nestedScrollEnabled` enables Android nested scrolling and has no DOM consumer.
Keep these props at call sites: the native wrapper still forwards them.

Verified against the installed `@legendapp/list` web build on 2026-10-05. Strip
unsupported props in this shared wrapper, not separately in each rail or screen.

The list membership search exposed the same warning for `scrollEnabled` on
2026-10-18. The installed web build does not consume it either. Strip it at this
same boundary; the native list still receives it for the sheet's outer scroller.

The details list picker initially measured height 0 on web and warned before
its rows could establish the content height. Its non-scrolling `List` reserves
one estimated row with `minHeight: 70`. It can still grow for more rows or the
empty state; a fixed height would clip them. Reproduced on 2026-11-08 by opening
the picker after a page reload, then verified without the warning after this fix.
