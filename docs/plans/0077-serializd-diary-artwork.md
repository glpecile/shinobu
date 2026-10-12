# Serializd diary artwork and episode integration

Normalize the actual diary payload's `showSeasons` and `showBannerImage` rather
than relying only on legacy `seasonName` and `posterPath`. Match `seasonId`
explicitly; preserve specials (season 0), episode numbers, log IDs and paging
timestamps. Season posters take precedence over show artwork. Correct season
numbers enable existing episode navigation and cross-provider diary merging.

For diary rows still missing artwork, reuse the existing TMDB-first metadata
query alongside the existing Trakt image recovery. Fetch only for missing art;
preserve provider artwork and let failed metadata reads leave the log visible.
Keep provider identity and history unchanged. No new proxy rules or dependency.

Use the existing muted, small ActivityIndicator treatment for the infinite-scroll
footer, retaining its fixed height and adding an accessible loading label.

Validate real Serializd-shaped episodes, season-level logs, unmatched seasons,
specials and legacy payloads in existing normalization tests. Run repository
checks. These JS changes hot reload; no native rebuild is required.
