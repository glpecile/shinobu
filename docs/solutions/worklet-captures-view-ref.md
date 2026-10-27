# Keep view refs out of worklet captures

Reanimated worklets copy captured objects to the UI thread. Capturing the whole
collapsible-section scroll context also copied its `content` view ref, which on
iOS logged `Cannot copy value of type ReactNativeElement` and
`Tried to modify key current`. Pull the shared values into locals and capture
only those; measure the view on the RN thread through `scheduleOnRN`.

Explicit dependency arrays on `useAnimatedStyle` are ignored on native and warn.
The worklets plugin tracks captures, so omit them (`WatchedMark`, `ProgressRing`).
