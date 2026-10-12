# SVG ring rotation on web

`react-native-svg`'s `origin` prop becomes a `transform-origin` DOM prop on
web, which React rejects. Progress rings use an SVG transform string instead:
`rotate(-90 cx cy)`. This starts the stroke at twelve o'clock on native and
web without `origin` or `rotation` props.

The foreground circle stays mounted, including at zero progress, so animating
`strokeDashoffset` with Reanimated can interpolate changes in either direction.
Reduced motion sets the timing duration to zero.
