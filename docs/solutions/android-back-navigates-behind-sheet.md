# Android Back navigates behind an open sheet

`@swmansion/react-native-bottom-sheet` 0.16.2 leaves Android Back handling to the
consumer. An open sheet therefore does not prevent navigation underneath it.

Version 0.17.0-next.2 adds `ModalBottomSheet.onCloseRequest`: a native controlled
close request for Android system Back, committed predictive Back, and Escape.
The shared native `Sheet` passes its existing `onClose` handler to this prop;
the caller updates `open`, which moves the sheet to its closed detent. No effect,
BackHandler subscription, or navigation route is needed. Further Back input is
consumed while the sheet animates toward its closed target.

The portal's activity-level callback is insufficient on pushed routes: native
stack fragments can take Back ahead of it, popping details while the sheet is
still visible. Android `Sheet` now also sets `nativeOverlay`, a supported API
in the same version. The sheet lives in a transparent `ComponentDialog` whose
own Back dispatcher invokes the close request before the activity stack can
receive it. Closing sheets keep consuming Back until settled; closed overlays
are non-focusable/non-touchable. iOS retains the portal and web its Modal.
This presentation change is JS-only on a client already built with the pinned
version; no BackHandler or per-screen navigation guard is added.

The dependency is pinned to that exact prerelease. This needs a clean native
rebuild (`bun android.clean`, or `bun ios.clean` for iOS), not just Fast Refresh.
Lint and TypeScript checks pass; device behavior remains to be checked after
rebuilding.
