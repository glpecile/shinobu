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

**Fix:** `@expo/ui` 58.0.26 converts both directions inside the community
picker (`localDateToUtcDayISOString` / `utcDayToLocalDate`), so pass local
dates and read local dates. The app had its own converter
(`android-utc-day.ts`) from before that release. Stacked on the library's, it
moved every pick one day **forward** west of UTC: tapping yesterday logged
today. Don't convert again in the app.

**Repro on the emulator:** set the AVD timezone away from UTC (e.g.
`adb shell service call alarm 3 s16 America/Argentina/Buenos_Aires`).
