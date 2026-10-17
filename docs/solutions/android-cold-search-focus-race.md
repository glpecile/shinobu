# Android search focused twice on first mount

The search tab queues a focus request before its lazy screen mounts. Android
also received `TextInput.autoFocus`. The queued handler could see the field
already focused while `Keyboard.isVisible()` was still false: that flag changes
on `keyboardDidShow`, not when opening starts. It blurred the field and scheduled
another focus, interrupting the first keyboard transition. Subsequent visits had
no mount autofocus, so they worked.

Android now uses only the queued tab-focus request. Keep the existing hidden-IME
re-focus path for Android Back, and preserve iOS and desktop-web autofocus.

## Supplied recording

Decoded all 167 frames with ffmpeg using `-fps_mode passthrough`, preserving the
variable timestamps (1.633 seconds, 576×1296). Do not resample this file using its
nominal `90000/1` frame rate.

| Time | Observation |
| --- | --- |
| 0.090–0.187 s | Search mounts; keyboard is not yet visible. |
| 0.196–0.271 s | The search content lifts, then drops before the visible IME entrance. |
| 0.280–0.554 s | Keyboard enters and content moves upward again. |
| 0.620–1.624 s | Layout stays settled. |

The pixels establish the interrupted layout, not native focus events; the
competing focus paths are established separately by the search handler's code.
