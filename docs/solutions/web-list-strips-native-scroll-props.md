# Strip native scroll props from the web List

Legend List's web build renders its own `ListComponentScrollView` over a raw
`div`, not react-native-web's `ScrollView`. Unrecognized props are forwarded to
that element, where React warns about unknown DOM attributes.

`src/components/List/index.web.tsx` strips `keyboardShouldPersistTaps`,
`keyboardDismissMode`, and `nestedScrollEnabled` before forwarding props.
`nestedScrollEnabled` enables Android nested scrolling and has no DOM consumer.
Keep these props at call sites: the native wrapper still forwards them.

Verified against the installed `@legendapp/list` web build on 2026-10-05. Strip
unsupported props in this shared wrapper, not separately in each rail or screen.
