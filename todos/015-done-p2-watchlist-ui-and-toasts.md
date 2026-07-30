---
status: done
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

> **Built 2026-07-29** — plan 0032's four units all landed (the `burnt` wrapper,
> the shared `features/write-sheet` picker, the watchlist add/remove picker sheet,
> and the retirement of every inline result surface). One gap is deliberately left
> open: `burnt`'s **Android** rendering is still unobserved — the emulator on the
> build host never rendered a screen — so KTD-2's named risk and its
> `lib/toast/index.android.ts` fallback stay live in
> `docs/solutions/burnt-toast-platform-behaviour.md`.

> **Planned 2026-07-29** — `docs/plans/0032-write-picker-and-toasts.md`. Both open
> questions below are answered by owner decision (2026-07-29) and recorded there:
> the **log path adopts toasts too** (one result idiom, so `LogMediaButton` and
> `LogConfirmSheet` change in the same PR), and the **picker stays open until the
> report settles** rather than closing on confirm — `burnt` has no press handler,
> so a 420 or an expired session would otherwise have nowhere to land.

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
4. **Write results move to toasts.** "Where it got watchlisted" is toast content, not
   an inline block under a button. Library: **[`burnt`](https://github.com/nandorojo/burnt)**
   (owner, 2026-07-28, replacing the earlier `sonner-native` idea — see the analysis
   below; burnt wins on every axis that matters here).
5. **Stop showing "Add on Serializd" / "Add on Letterboxd" rows** (owner, 2026-07-28):
   *"I still don't like having the add on serializd/letterboxd thing. We could remove
   it maybe… If we are going to try the spike I'd much prefer complete support."*
   See "The manual rows" below — most of this resolves itself, and the residue has a
   better home than deletion.

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

## `burnt` vs `sonner-native` — decided, with one hard constraint

Owner picked `burnt`. Verified 2026-07-28; it is the better fit here, and the
comparison is worth keeping because the deciding factor also constrains the design.

| | **burnt** | `sonner-native` |
|---|---|---|
| Web | **Supported, same API** — wraps Emil Kowalski's `sonner` under the hood | Works but its README says *"not recommended… use the original Sonner"*, via a hand-written `.web.ts` split |
| Implementations to maintain | **One** | **Two**, kept in agreement by hand |
| New native deps | **None** beyond itself | `react-native-svg` **and** `react-native-screens`, neither installed |
| Rebuild | Yes (`expo prebuild`; no Expo Go) | Yes |
| Precedent in this repo | **`@nandorojo/galeria` is already a dependency** — same author, already trusted by AGENTS.md | none |

The rebuild is a non-issue: Shinobu already cannot run in Expo Go (nitro modules), so
a dev client is the standing workflow. It still needs stating in the PR per AGENTS.md's
hot-reload-vs-clean-prebuild rule.

**The hard constraint — and it decides the whole result-surface design.** `burnt`'s
options are `title`, `message`, `preset`, `icon`, `haptic`, `duration`,
`shouldDismissByDrag`, `from`, `layout`. **There is no `onPress`, no action, no
button, no tappable handler**, and custom React content is web-only (`icon.web`).

So: **a burnt toast can announce an outcome, but it can never *be* the recourse.**
Anything carrying a `providerItemUrl` link — a failed provider, a reasoned skip —
needs a surface the user can actually tap. That is not a reason to reject burnt; it is
the boundary the design has to respect:

- **Toast** = "Added to Trakt and AniList." The happy path, which is the common case
  and the one that deserves to be ephemeral and out of the way.
- **A real surface** = anything with a link or a decision. That is the picker modal
  (item 1), which is open at the moment of the write anyway.

This retires the "is a toast the right carrier for partial failure?" question with a
concrete answer: **no, and it does not have to be**, because the picker is already on
screen and can hold the report.

## The manual rows — mostly self-solving, and the residue belongs in the picker

Owner dislikes the persistent "Add on Serializd" / "Add on Letterboxd" rows and would
rather have complete support. Both halves are right, but they are two different things
wearing one costume:

**(a) Pre-spike placeholders — these disappear on their own.** Serializd declares
`'manual'` only because its endpoints are not wired yet (plan 0031 U9/PR B), and
Letterboxd only because its endpoint is uncaptured (U6). **If the spikes land, both
become `'write'`, `manual` is empty, and the rows vanish with no code change.** The
owner's "I'd much prefer complete support" *is* the fix for this half — it is
already the plan, and nothing here should pre-empt it by deleting the affordance that
covers the interim.

**(b) Letterboxd on web — structurally permanent.** Three spike rounds, four
transports, all fingerprint-walled (`docs/solutions/letterboxd-web-proxy.md`). No
spike will fix this one. So *something* has to happen when a web user watchlists a
film with Letterboxd connected.

**Recommendation: move it, don't delete it.** Deleting outright reverses AGENTS.md's
standing policy ("an unsupported-or-failed provider write surfaces a manual deep link
… never a dead-end error") and plan 0022 R3/R4/R7 — that is the owner's call to make,
but it should be made knowingly, and it would mean a web user's Letterboxd watchlist
silently never receives anything.

The picker modal makes a better answer available: show Letterboxd there as a
**disabled row with its reason** ("can't be added from the web"), with the link on
that row. The user learns it at the moment they are choosing targets, the details
screen stays clean, and the no-dead-end contract survives in a place that is *more*
discoverable than a permanent link nobody reads. If the owner still wants it gone
entirely after that, the change is one line in the picker — but the AGENTS.md policy
sentence has to be amended in the same PR rather than quietly contradicted.

## Open questions the plan must answer

- ~~**Does the log path adopt toasts too?**~~ resolved 2026-07-29 — **yes**, one
  result idiom. `LogMediaButton` and `LogConfirmSheet` change in the same PR
  (plan 0032 R9/U4).
- ~~**What does the picker do on a *failure* after it has closed?**~~ resolved
  2026-07-29 — **it does not close**. The picker stays mounted until the report
  settles and closes only on a clean report, which is the same argument plan 0031 U8
  made for the card sheet. Rejected: close-on-confirm with failures reopening it — a
  modal that reappears reads as a bug and loses the deselection context
  (plan 0032 R4).
- ~~**Icons:**~~ resolved 2026-07-28 — verb icons (eye vs bookmark) on the CTA
  itself, via `Button.Icon`. `ProviderIcon` stays for provider rows.
- ~~**Which toast library, and does it work on web?**~~ resolved 2026-07-28 — `burnt`,
  yes, one API across all four targets.

## Acceptance criteria

- [x] The watchlist CTA is visually distinct from the log CTA at a glance — different
      variant/affordance, not just different label text. *(2026-07-28)*
- [x] Both CTAs carry an icon, from the existing icon set, sized and aligned per the
      `components/button` contract rather than hand-placed. *(2026-07-28 — `Button.Icon`)*
- [ ] Watchlisting opens a picker; every applicable connected provider starts
      selected; deselecting narrows the write; the confirm label names what will
      happen without naming providers in a tagline.
- [ ] Success surfaces as a `burnt` toast on all four targets, one implementation.
- [ ] **Nothing that needs a tap lives in a toast** — burnt has no press handler, so
      every `providerItemUrl` link lives on a real surface (the picker), not a toast.
- [ ] Plan 0022's contract survives the move: a manual target and a reasoned skip
      still reach the user with a working link. If the owner chooses to drop the
      Letterboxd-on-web affordance entirely, AGENTS.md's never-a-dead-end sentence is
      amended in the **same** PR, not silently contradicted.
- [ ] The persistent "Add on …" rows are gone from the details screen — by the spikes
      landing (Serializd, Letterboxd native) and by moving the web-Letterboxd case
      into the picker, not by deleting the contract.
- [ ] `expo prebuild` + a dev-client rebuild is stated in the PR (AGENTS.md).
- [ ] The log path and the watchlist path use one result idiom, not two.
- [x] `components/button`'s API absorbs the icon rather than call sites hand-rolling
      it (AGENTS.md: buttons are `components/button`, `className` is layout only).
      *(2026-07-28 — `icon` prop + `Button.Icon`)*

## Not in scope

Re-opening the fan-out, the three-state capability model, or any of plan 0031's three
data-loss guards. This is the presentation layer of a verb whose semantics are settled.
