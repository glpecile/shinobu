# Immediate disclosure presses

The shared pressables suppress repeat presses for 500 ms. Disclosures need
every press to toggle, including a second press during their animation.

- Add `pressBehavior="immediate" | "prevent-repeat"` to both shared pressables.
  Keep `prevent-repeat` as the default for existing actions.
- Use `immediate` for all disclosure headers, including expandable text cards.
- Require immediate presses on pressables declaring an expanded accessibility
  state through lint. Test both press behaviors and the lint rule.
- Validate with the existing checks and rapid toggles in the running app.

This is a JavaScript change and needs no native rebuild.
