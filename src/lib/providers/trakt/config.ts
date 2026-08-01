export const TRAKT_API_BASE_URL = 'https://api.trakt.tv';
export const TRAKT_AUTHORIZE_URL = 'https://trakt.tv/oauth/authorize';

/**
 * Detached (plan 0034 R12): Shinobu ships no Trakt credentials — these no
 * longer read `EXPO_PUBLIC_TRAKT_*` and always resolve empty, so the only
 * activation path is the guided BYO setup (`connect-trakt-button.tsx`) whose
 * credentials land in MMKV and win the `provider-config.ts` merge.
 *
 * Kept as functions rather than deleted (KTD-7: detachment is a config
 * change, not code removal) — the merge, `auth.ts`, and the registry entry
 * are untouched, and a future re-attachment is a one-line revert here.
 */
export function traktClientId(): string {
  return '';
}

export function traktClientSecret(): string {
  return '';
}
