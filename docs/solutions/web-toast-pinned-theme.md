# Web toasts follow the app theme

React Native Web's `useColorScheme()` reports the OS preference. Uniwind's
`setTheme()` changes the app's theme on web without overriding that API, so a
pinned Light or Dark appearance can differ from the OS.

The web toast host reads `useUniwind().theme`, the resolved app theme, to keep
Sonner consistent with the page. Native theme consumers can keep using
`useColorScheme()` because Uniwind sets native `Appearance` there.

Verify by selecting Light on a dark OS, then Dark, and checking Sonner's
`data-sonner-theme` attribute after each selection and after a reload.
