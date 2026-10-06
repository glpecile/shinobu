# Virtualized season episodes

## Scope

Dragon Ball Z's first season mounts 39 interactive episode rows when opened.
Use the diary's flat disclosure-list pattern: one screen-level `List` contains
season headers, season logging actions and only expanded episodes. Never put a
full-height vertical virtualizer inside the details `ScrollView`.

- Extract the diary's keyed expansion state into a hook shared with seasons.
- Let TV and anime season controllers render the same episode list with the
  detail hero as its header and the remaining detail sections as its footer.
- Keep episode catalogue queries independently suspense/error bounded in the
  section heading in the list header. Non-suspense cache subscribers supply flat
  list data, without blocking or remounting the hero on a cold fetch.
- Preserve watched marks, unaired guards, mapping, logging sheets, row navigation,
  long-press actions, provider fan-out, refresh and the scrolled title.
- Keep recycling off (episode rows own hover state), measure variable row heights,
  and schedule native disclosure reflow through the existing reduced-motion hook.
  Web disclosures toggle instantly, as diary flat disclosures already do.

## Validation

The owner will test device feel and Dragon Ball accordion interaction. Device
profiling was stopped at their request before any expansion, so no before/after
timing claim is made. Run repository checks and focused flat-row tests covering
closed/open seasons, multi-season keys and episode ordering. JS-only: hot reload;
no native rebuild.

Lint, typecheck, class-name and router-push checks, external links, and all 1,257
tests passed, including three flat-row cases using 39/35-episode seasons.
