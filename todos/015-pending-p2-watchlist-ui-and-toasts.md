---
status: pending
priority: P2
---

# Watchlist CTA UI, a target picker, and toasts for write results

Owner feedback on plan 0031 PR A (#41), 2026-07-28: *"this is bad in terms of UI …
I want to open a modal to pick and choose where I watchlist. I'd like to have icons
next to the log/watch and watchlist, the button should be different than the watch
one … Showing details like where it got watchlisted is information we will start
delegating to a toast library."*

Sequencing is decided: **finish plan 0031 first** (PRs B, C1, C2), then plan this.
The write verb, the read surface and removal all land against today's inline result
block; this todo replaces that surface afterwards rather than racing it.

## What the owner asked for

1. **A target picker modal for watchlisting.** Choose which trackers receive it,
   instead of one silent tap that goes everywhere.
2. ~~**Icons on both CTAs**~~ — **done** (2026-07-28): `Button.Icon`, a
   context-driven compound subcomponent that inherits its button's colour and size.
   `eye`/`eye-outline` on the log CTA, `bookmark`/`bookmark-outline` on the watchlist
   one, filled meaning "already done" on both.
3. ~~**The watchlist button must look different**~~ — **done** (2026-07-28): it is
   `outline` (accent on transparent) against the log CTA's filled `primary`, and
   `quiet` once settled. The manual "Add on …" row is centred under the pair, and the
   log CTA drops to `mb-3` so the two read as two options rather than two blocks.
4. **Write results move to toasts**, via [`sonner-native`](https://github.com/gunnartorfis/sonner-native-toasts)
   — "where it got watchlisted" is toast content, not an inline block under a button.

## What this reverses, deliberately

- **Plan 0031 KTD-8 rejected a confirm sheet** for watchlisting ("the payload is the
  item and nothing else … one tap plus an inline result line"). Item 1 reverses that.
  It is *not* a reversal of the fan-out itself: the log path already pairs a fan-out
  with an opt-out picker inside `LogConfirmSheet`, so watchlisting adopting the same
  shape is consistent — default to every applicable connected tracker, let the user
  deselect. Say so in the plan; do not re-litigate the fan-out.
- **The 2026-07-27 settled decision** ("never a per-provider action the user picks a
  target for") narrows to: never a *single*-provider action the user must aim. A
  multi-select that starts fully selected preserves the original intent.
- **Plan 0031 U8's three-family result surface** (upfront manual rows, failed
  outcomes, reasoned skips) exists because dropping the confirm sheet dropped two of
  plan 0022's renderers. Re-introducing a sheet plus toasts changes which of those
  three still need an inline home. The *contract* must survive the move: plan 0022's
  never-a-dead-end rule is not negotiable, so a manual target and a reasoned skip
  still have to reach the user with their `providerItemUrl` link — a toast that
  auto-dismisses is a weaker carrier than a persistent row, and that tradeoff needs
  an explicit answer, not an assumption.
- **U8's "the card sheet stays mounted through the write"** was argued *because* the
  app had no toast component. A toast retires that argument and the row can close on
  tap like the hide row does. Check this when it lands.

## Open questions the plan must answer

- **Does `sonner-native` work on web?** Shinobu targets web + iOS + iPadOS + Android
  from one codebase. If it is native-only, the result surface forks by platform and
  half the value evaporates. **Verify before designing anything on top of it.**
- **Does it need a native rebuild?** It builds on reanimated (4.5.0) and
  gesture-handler (~2.32.0), both already linked, so it is plausibly pure JS — but
  confirm against its install docs rather than assuming, and state the answer, per
  AGENTS.md's hot-reload-vs-clean-prebuild rule.
- **Is a toast the right carrier for a partial failure?** "Logged to Trakt, failed on
  AniList, Letterboxd needs a manual add" is three outcomes with a tappable link on
  two of them. That may want a persistent surface, or a toast that expands, or one
  toast per provider. Decide deliberately.
- **Does the log path adopt toasts too?** Two result idioms for two near-identical
  verbs would be worse than the current inconsistency. Probably yes, which makes this
  a change to `LogMediaButton` and `LogConfirmSheet` as well — price that in.
- ~~**Icons:**~~ resolved 2026-07-28 — verb icons (eye vs bookmark) on the CTA
  itself, via `Button.Icon`. `ProviderIcon` stays for provider rows.

## Acceptance criteria

- [x] The watchlist CTA is visually distinct from the log CTA at a glance — different
      variant/affordance, not just different label text. *(2026-07-28)*
- [x] Both CTAs carry an icon, from the existing icon set, sized and aligned per the
      `components/button` contract rather than hand-placed. *(2026-07-28 — `Button.Icon`)*
- [ ] Watchlisting opens a picker; every applicable connected provider starts
      selected; deselecting narrows the write; the confirm label names what will
      happen without naming providers in a tagline.
- [ ] Results surface as toasts, on **every** platform the app ships to, or the
      platform fork is explicit and argued.
- [ ] Plan 0022's contract survives: a manual target and a reasoned skip still reach
      the user with a working `providerItemUrl` link, and neither is lost to an
      auto-dismiss.
- [ ] The log path and the watchlist path use one result idiom, not two.
- [x] `components/button`'s API absorbs the icon rather than call sites hand-rolling
      it (AGENTS.md: buttons are `components/button`, `className` is layout only).
      *(2026-07-28 — `icon` prop + `Button.Icon`)*

## Not in scope

Re-opening the fan-out, the three-state capability model, or any of plan 0031's three
data-loss guards. This is the presentation layer of a verb whose semantics are settled.
