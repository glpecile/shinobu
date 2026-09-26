# App version and releases

Add an About card at the bottom of Manage Trackers with the Shinobu name,
the running app's Expo config version, and a View releases button linking to
https://github.com/glpecile/shinobu/releases.
Place the name and version beside the button in one row. Hide the button on web.

Reuse the screen's card styles, Button, and openExternalUrl helper. Read the
version through the installed expo-constants package so release bumps appear
automatically on native and web.

Validate with typecheck, lint, and the existing class-name and navigation checks.
This is a JavaScript-only change and hot reloads.
