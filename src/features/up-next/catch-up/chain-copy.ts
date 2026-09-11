import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/**
 * The chain's two lines of copy (plan 0037, redesigned 2026-09-11).
 *
 * The sheet used to render one row per fired write, so a five-episode
 * catch-up grew a five-line ledger under the form and the drawer turned into
 * a scrolling receipt. A drawer shows **one thing at a time**: these two
 * functions collapse the whole ledger into a single line each — one while the
 * chain runs, one when it ends badly — so the sheet swaps between views
 * instead of accreting rows. Pure, so the wording is testable without a sheet.
 */
const list = (ids: readonly ProviderId[]) =>
  ids.map((id) => PROVIDERS[id].label).join(', ');

/**
 * The primary button's label: the verb *and* the chain's state, in one string
 * that morphs from press to press (`Log episode 4 · 1 logged` →
 * `Log episode 5 · 2 logged` — only the digits move). The state used to be a
 * separate line above the button, which is a second thing to read for a fact
 * the button is already about.
 *
 * One number, not three. A failure outranks a success because it is the half
 * that needs a decision; the in-flight count is left out entirely — the label
 * having already advanced to the next episode *is* "the last one is away".
 * The end-of-chain report names both halves in full.
 */
export function chainLabel(
  code: string,
  counts: { landed: number; failed: number },
): string {
  const { landed, failed } = counts;
  const suffix =
    failed > 0 ? `${failed} failed` : landed > 0 ? `${landed} logged` : null;
  return suffix == null ? `Log ${code}` : `Log ${code} · ${suffix}`;
}

/**
 * The failure view's headline. Names the episodes while they are still
 * countable and falls back to a count past two, because "Episodes 4, 5, 6, 7
 * and 8 failed on AniList" is a paragraph pretending to be a headline.
 */
export function chainFailure(
  codes: readonly string[],
  failed: readonly ProviderId[],
): string {
  const subject =
    codes.length === 1
      ? capitalize(codes[0]!)
      : codes.length === 2
        ? `${capitalize(codes[0]!)} and ${codes[1]}`
        : `${codes.length} episodes`;
  return failed.length > 0
    ? `${subject} failed on ${list(failed)}`
    : `${subject} didn’t log`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
