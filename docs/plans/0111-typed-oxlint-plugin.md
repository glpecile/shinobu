# Typed Oxlint plugin

Follow [T3 Code's plugin structure](https://github.com/pingdotgg/t3code/tree/main/oxlint-plugin-t3code)
so each convention has a typed rule and a colocated CLI test.

- Move the six existing Shinobu rules into `oxlint-plugin-shinobu/rules/`.
  Register them with `defineRule` and `definePlugin` from `@oxlint/plugins`.
- Replace the class-name and unguarded-router regex scripts with AST rules.
  Preserve the navigation implementation exemption and non-press reason comments.
- Run all source conventions through `bun lint`. Remove the duplicate package
  commands and CI steps, and update contributor instructions.
- Keep live external URL health probes separate from deterministic lint.
- Fix lint warnings encountered during the refactor without changing app behavior.

Verification uses the existing rule fixtures through the Oxlint CLI, focused
fixtures for the migrated script checks, the full isolated test suite,
`bun typecheck`, `bun lint`, and `git diff --check`. Confirm the real app config
rejects class-name templates and unguarded pushes. No native rebuild or UI change
is needed for lint tooling or warning-only source cleanup.
