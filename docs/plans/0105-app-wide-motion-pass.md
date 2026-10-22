# App-wide motion pass

Run `find-animation-opportunities`, implement with `animate-expo` and the existing
web motion system, then apply `review-animations` to the result.

## Opportunities

| Location | Today | Purpose | Frequency | Recipe |
| --- | --- | --- | --- | --- |
| `components/overlay-actions-button.tsx` and its callers | Hover actions appear and disappear abruptly; two callers unmount them on pointer leave | State indication | Tens per day | Retarget opacity with `EASE_OUT`, 120ms on reveal and exit. Keep focus reveal instant. No movement, including with reduced motion. Keep hover callers mounted. |

## Rejected candidates

- Tab entrances: core navigation, often keyboard initiated. Remove the extra
  tab blur/fade; retain native navigation behavior and pushed-screen transitions.
- Like celebration: a frequent field toggle already has press feedback and a
  selected heart. Remove the extra keyframe pop, which also plays on an already
  liked item mounting.
- Virtualized rows and poster walls: data should remain readable while scrolling.
  Keep the existing container entrances and explicit disclosure handling. Never
  attach new entrances to recycled or remounted cells.
- Empty states and provider connections: existing section entrances, Home's
  floating marks, and moved-provider feedback already explain these changes.
- Sheets, toasts, loading buttons, counters, progress rings, segmented controls,
  and collapses: existing shared components own these transitions. Additional
  animation would duplicate them.

## Review corrections

- Shared card presses must keep opacity feedback but drop scale when reduced
  motion is requested. Preserve each caller's normal scale setting.
- The sidebar keyboard shortcut must change state instantly. Pointer toggles
  may keep the existing disclosure animation, with reduced motion disabling
  width movement.

## Scope and validation

Change shared components and the two conditional hover callers. Preserve the
existing unrelated `tag-picker.tsx` edit. No dependencies or native configuration
changes; JavaScript changes hot reload.

Run lint, typecheck, route/class/link guards and existing tests. Exercise local
Android press and like behavior without submitting logs. Validate web hover,
keyboard focus, tabs, and reduced motion when a browser is available. Release
hardware animation timing remains a separate check.

## Review

| Before | After | Why |
| --- | --- | --- |
| Hover actions snap into place | Opacity retargets in 120ms; focus reveals instantly | A small state change stays legible without moving content or delaying keyboard access |
| Media cards and link pills unmount hover actions | Actions stay mounted and receive visibility | Exit fades can complete; hidden controls can reveal on keyboard focus |
| Every liked heart mounts with a scale pop | The selected icon changes immediately | A frequent field toggle already has press feedback; loading a liked item should not celebrate |
| Web tabs replay a blur/fade | Tab switches have no extra page entrance | Frequent navigation should respond immediately |
| Card presses scale under reduced motion | Card presses dim under reduced motion | Keep feedback without movement, through the shared pressable |
| Sidebar keyboard shortcut animates width | Shortcut snaps; reduced motion also disables pointer-driven width transitions | Keyboard use must stay immediate; reduced motion must not resize the page gradually |

Code review verdict: **Approve** the scoped changes. The only new animation is
an interruptible opacity transition using existing tokens, with no new timers,
effects, layout animation, or dependencies. This is not release-device feel
approval.

Validation on 2026-10-22:

- 1,516 tests passed across 155 files. The reduced-motion regression fails
  against the original pressable and passes with the fix.
- Typecheck, class-name guard, route guard, diff check, and all 12 external URL
  checks passed. Lint passed with seven existing warnings in unrelated files.
- Production web export completed successfully. Expo reported that it forced
  its own process to exit after writing `dist`.
- Android dev-client screen rendered the log form and selected heart. Input and
  component inspection were intermittent; this is screen evidence, not a full
  interaction or timing pass. No log was submitted.
- Web interaction QA remains unverified: Argent's Chromium endpoint exposed no
  page target, and the computer-use fallback could not attach to a browser.
- iOS, real hardware, and release performance were not exercised.

Environment inspection confirmed Expo SDK 58, React Native 0.88, installed
Reanimated 4.7.1, Worklets 0.13.0, Metro on 8081, and the running Pixel 9 Android
emulator. Native directories are generated; the changes need no native rebuild.
