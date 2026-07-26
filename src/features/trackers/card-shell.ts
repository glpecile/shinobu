/**
 * One card padding and one control radius for every card on the Manage
 * Trackers screen. The four connect shells and the connected row had drifted
 * apart (`p-5` vs `px-5 py-4`, bare `rounded` vs `rounded-xl`); these two
 * constants are what "normalized" means, so a new card can't drift again.
 */
export const CARD_SHELL = 'bg-surface border border-border rounded-xl p-5';

/** Buttons and inputs — never bare `rounded` (4px reads as an accident). */
export const CONTROL_RADIUS = 'rounded-md';
