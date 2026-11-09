# Android refresh release helpers run on the UI thread

`usePanGesture` workletizes its callbacks, but not a standalone helper they call.
A plain `release()` spring-config helper in `RefreshControl` caused a completed
pull to throw `[Worklets] Tried to synchronously call a Remote Function. Called
"release" on the UI Runtime.`

The helper needs its own `'worklet'` directive. The component's mocked tests
cannot check that runtime boundary; reproduce with a pull on Android. Keep the
pending guard in the shared refresh runner too: a tab double-tap can start a
refresh while an already-active pull is still above the trigger. Its later
release must not start another refresh.

Verified on the Android 17 emulator in a development build. Release-build spring
feel and physical haptic strength require hardware verification.
