# Composed easings run linear in Reanimated web layout animations

Reanimated 4.7.1's predefined web layout-animation builders (`FadeOutDown`,
etc.) read the `bezier` metadata that `Easing.bezier` attaches. Composed
functions such as `Easing.out(Easing.quad)` carry none and fall back to linear,
so shared exit curves are beziers.

Custom `Keyframe` definitions use a different parser that only recognizes named
curves, so any bezier inside a `Keyframe` still runs linear on web.
