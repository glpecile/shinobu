# Android Expo Widgets and custom notifications (#211)

Evaluated `expo-widgets@58.0.21`, the version SDK 58 supports, on 2026-10-21. It
was checked against the published package source (Kotlin, config plugin, and
types), the SDK 58 docs, and `expo/expo` main. **Decision: adopt neither surface
yet.** Each one fails an acceptance criterion of #211 for a reason Shinobu can't
fix without patching the library.

## What SDK 58 ships

- **Home-screen widgets** (`createWidget`, `updateSnapshot`, `reload`) render on
  Glance. A widget layout is a `'widget'`-directive function built from
  `@expo/ui/jetpack-compose` components and evaluated in an isolated Hermes
  runtime. The plugin enables Android only with the undocumented
  `enableAndroid: true` option. On Android a widget has no timeline:
  `updateTimeline` and `getTimeline` are iOS-only. It never refreshes on its
  own (`updatePeriodMillis="0"`), so it changes only when JS calls
  `updateSnapshot`.
- **Custom notifications** (`createCustomNotification`, added in 58.0.17 and
  crash-fixed in 58.0.20) post a `RemoteViews` notification with collapsed,
  expanded, and heads-up layouts. A tap opens `url` as a deep link.

## Home-screen widget (Up Next): blocked

- **A tap can't open the app.** The emitter (`ExpoWidgetEmittableTree.kt`)
  attaches a click only to `Button`s. That click sends a broadcast that
  re-evaluates the layout and emits `onExpoWidgetsUserInteraction` to a JS
  listener, which exists only while the app is running. No root click, no
  `actionStartActivity`, and no `url` exist, so the widget can't link to
  `routes.*`. This makes it a dead end, which AGENTS.md forbids. `expo/expo`
  main had no change for this as of 2026-10-19.
- **It changes the iOS build.** `withWidgets` always runs `withIosWidgets`
  when `ios.bundleIdentifier` is set. That adds an `ExpoWidgetsTarget`
  extension and a `group.xyz.glpecile.shinobu` App Group entitlement, which
  needs signing changes. Keeping iOS unchanged would take a local plugin that
  deep-imports `expo-widgets/plugin/build/android/withAndroidWidgets`, plus
  `expo.autolinking.ios.exclude`. That workaround depends on internal paths.
- **Staleness is workable but unproven.** Up Next could be written by
  `updateSnapshot` on each notification refresh, which uses the same cached
  provider data and background task. That would make the widget as stale as
  the last refresh, about 15 minutes or more on Android. This is moot until a
  tap can open the app.

## Custom release notification: no gain

- **It can't be scheduled.** `post()` renders and posts right away. Release
  notifications are scheduled as `DATE` triggers 7–14 days ahead
  (`features/notifications/scheduler`), so they fire while the app is dead. A
  custom notification would have to be posted from `expo-background-task` at
  fire time. That task runs no more often than every 15 minutes, at the OS's
  discretion, so alerts would be later and less reliable than they are now.
- **The tap target works.** `url` opens a deep link, with
  `setPackage(context.packageName)`. A disabled channel or notifications turned
  off make `post()` reject, which degrades safely. But better looks don't
  justify a less reliable alert, and the current notification already opens
  the item.

## Revisit when

- `expo-widgets` lets a widget open a deep link (a root or element `url`, or
  `actionStartActivity`). Then build Up Next as a snapshot widget, with the
  native rebuild (`bun android.clean`), an empty state for no providers, and
  "last updated" text for stale data.
- `expo-widgets` can schedule custom notifications, or `expo-notifications`
  accepts custom content views. Then move the scheduled release notification to
  the richer layout.
- The Android-only plugin entry becomes public API, so iOS can stay unchanged
  without deep imports.

## Shipped instead: notifications grouped by kind

The scheduler already knows what each notification announces (an episode, or
a theatrical, digital, or physical release). Each kind now gets its own
Android channel (`new-episodes`, `theatrical-releases`, `digital-releases`,
`physical-releases`), so system settings can mute one kind without the others.
The channel id is also the `threadIdentifier`, which stacks each kind on its
own in the Android shade and in iOS Notification Center. `new-episodes` keeps
its id, so existing channel settings survive. A new hash prefix reschedules
the existing batch once, onto the new channels. This is a JS-only change, so
no native rebuild is needed. Web is unchanged.
