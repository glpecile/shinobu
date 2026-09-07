# Android date picker returns the day before (west of UTC)

**Symptom:** on a physical Android phone in a UTC−N zone, picking "5" in the
log sheet's "Watched on" picker yields the 4th. Never reproduces on the
emulator.

**Cause:** `@expo/ui/community/datetime-picker` on Android is a Compose
Material3 `DatePicker`. Its `selectedDateMillis` is **UTC midnight of the
picked day**, and `DatePickerView.kt` forwards it as-is; the JS wrapper does
`new Date(millis)`. Sept 5 00:00Z is Sept 4 21:00 in UTC−3, so every local
rendering (field label, Letterboxd's `localDateStr`, provider profiles in the
user's zone) shows the day before. Emulators default to `UTC`, hiding it. The
`value` prop has the mirror problem: a local instant is read as UTC millis, so
late evening in a UTC+N zone highlights tomorrow.

**Fix:** `features/log-media/watched-at-field/android-utc-day.ts` converts
both directions on Android only (`toPickerValue` / `fromPickerValue`, keeping
the current time-of-day like the web field). iOS's UIDatePicker returns local
instants and is untouched.

**Repro on the emulator:** set the AVD timezone away from UTC (e.g.
`adb shell service call alarm 3 s16 America/Argentina/Buenos_Aires`), or run
the unit test under `TZ=America/Argentina/Buenos_Aires bun test`.
