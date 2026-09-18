# A native tab press wipes the tab's route params

**Symptom.** On search, switching to Cast & crew and then tapping the Search
tab again (to bring the keyboard up) switched the scope back to Titles.

**Cause.** Every tap on a `NativeTabs` trigger, including a tap on the active
tab, dispatches `JUMP_TO` with no params
(`expo-router/build/native-tabs/NativeBottomTabsNavigator.js`). The tab router
builds the route's new params from the action (`createParamsFromAction`), so
they become `undefined`. `?scope=` was read straight from the params and reset.
`?q=` survived only because the field already held the query in state.

**Fix.** Seed state from the param and write both on change, as `?q=` does.
The param stays a shareable link, and the state is what the screen reads.
Anything a tab screen reads from `useLocalSearchParams` alone is lost on the
next tap of its tab.
