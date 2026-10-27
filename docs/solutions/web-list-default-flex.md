# Web List needs ScrollView's default flex

Legend List's web scroller is a raw block `div`, without React Native
ScrollView's flex defaults. A vertical list without its own sizing starts at
zero height or grows to its rows instead of scrolling inside the viewport. The
web `List` wrapper applies `flexGrow: 1, flexShrink: 1` before the caller's
style. Horizontal rails and `scrollEnabled={false}` lists keep fitting their
content.
