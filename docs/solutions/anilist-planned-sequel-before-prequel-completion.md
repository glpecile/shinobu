# Planned sequel premieres before prequel completion

The recent-premiere exception admitted every planned AniList season after its
first episode aired, even while the viewer was catching up on earlier seasons.
AniList treats each season as a separate media item, so premiere recency alone
does not prove the viewer is ready to start it.

The existing list request now reads PREQUEL relations and each related anime's
viewer list status. A planned premiere stays out of Continue Watching until
those prequels are COMPLETED. An untracked prequel has no completion proof and
also holds the sequel back. Other relation types and manga do not block it.
Upcoming premieres remain in Calendar; CURRENT entries keep their progress.
No extra provider request or title matching is needed.

The regression runs raw relation statuses through normalization and Up Next,
including an untracked prequel, completed prequel and the premiere boundary.
