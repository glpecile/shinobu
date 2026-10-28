# Android alternate icons must preserve the callback activity

`expo-alternate-app-icons@8.0.0` switches icons by enabling a launcher alias
and disabling the component that launched the current Activity. That Activity's
component does not change during its lifetime. Switching from the default to
Crimson and back therefore returns early without restoring the default;
switching to Void instead leaves both alternate aliases enabled.

The plugin also gives aliases only the explicitly configured Android intent
filters. Expo's `scheme` filters remain on MainActivity. Disabling MainActivity
then removes the handler for `shinobu://redirect`, breaking provider sign-in.
A read-only execution of the plugin against app.json confirmed its aliases had
HTTPS filters but no `shinobu` filter.

Use `@hzblj/expo-app-icons@0.1.4` instead. It gives the default icon its own
launcher alias, keeps MainActivity enabled with all its deep links, and updates
all aliases from PackageManager state. It applies pending changes when the app
backgrounds, which Settings explains. It leaves the default adaptive icon and
`with-dark-adaptive-icon.js` resources intact. No dependency patch is needed.

When changing this integration, verify default to alternate to another alternate
to default, then resolve `shinobu://redirect` after every applied change.

References: [upstream deep-link report](https://github.com/pchalupa/expo-alternate-app-icons/issues/260),
[replacement API and Android lifecycle](https://github.com/hzblj/expo-app-icons#platform-behavior).
