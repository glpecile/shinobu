# Catch notification failures inside async transitions

React's async transition turns a rejected action into a render error. Moving
notification permission and scheduling work from an event promise into
`startTransition` can therefore replace Settings with its error boundary when
the native permission request or scheduler fails.

Catch inside the transition and show the shared error toast, keeping Settings
mounted and the toggle available for retry. Permission denial remains the
existing inline explanation. A scheduling failure leaves the user's opt-in
intact so a later foreground refresh can retry it.

`notifications-settings/index.test.tsx` covers rejected permission requests and
scheduling, then a successful retry. The test fails against the uncaught action.
