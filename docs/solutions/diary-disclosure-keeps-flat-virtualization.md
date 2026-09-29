# Diary disclosure keeps flat virtualization

Diary days are flattened into one recycled Legend List. Wrapping a whole day
in `Collapse` would replace row virtualization with day virtualization and
mount every log in a large day. Keep the flattened data and remove closed
days' entries as before.

Native toggles schedule `DISCLOSURE_LAYOUT` through `useDisclosureToggle`.
Reduced motion disables layout scheduling. Web keeps the original List:
always-on item layout transitions animate initial position measurements and
compete with `SectionEnter`. Do not add entering or exiting animations to
the recycled row contents. Web diary day bodies currently toggle instantly.

Feed disclosures have the same mount constraint. `Collapse` on web starts at
natural height and disables transitions until its open prop changes. Otherwise
its first height measurement grows the body from zero while `SectionEnter`
fades it in, moving neighboring sections during their entrance.

Metro selects platform wrappers independently of TypeScript's default
resolution. Keep exports consistent in native and web files; a missing web
export can pass typecheck but crash with an undefined element type.

Diary exports an Expo Router error boundary to contain render failures inside
the route. The root boundary otherwise removes the app shell as well.
Neither boundary navigates to `/redirect`; that route handles OAuth callbacks.
