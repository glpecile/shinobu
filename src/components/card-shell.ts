/**
 * One card shell for every card on the Manage Trackers screen. The four connect
 * shells and the connected row had drifted apart (`p-5` vs `px-5 py-4`, bare
 * `rounded` vs `rounded-xl`); this constant is what "normalized" means, so a
 * new card can't drift again.
 *
 * `rounded-card` (12px) rather than the one-off `rounded-xl` it started as:
 * that is the radius token posters, tiles and episode cards already use, so a
 * settings card and a media card now round by the same amount.
 *
 * There is no matching control constant — `components/button` owns every
 * button's radius, padding, and disabled/loading treatment.
 */
export const CARD_SHELL = 'bg-surface border border-border rounded-card p-5';
