# Dismissing the Android keyboard from a log sheet

The keyboard's Done action in the episode and book log sheets finishes editing
the focused field. The sheet stays open with the current draft so the user can
review it before logging.

React Native's single-line default, `blurAndSubmit`, clears focus and then
requests a keyboard hide. Android's `KeyboardController.dismiss()` needs the
focused input to find the window and hide its IME. For single-line `TextField`
callers that request Done and leave submit behavior to the component, use
`submit` on Android and let the controller hide the IME before clearing focus.
An explicit submit handler or blur behavior takes precedence.
