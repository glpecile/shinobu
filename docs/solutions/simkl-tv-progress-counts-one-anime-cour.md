# TV progress must combine Simkl anime cours

The TV detail page for You and I Are Polar Opposites showed 12 episodes
logged and 12 / 25 progress, while the owner had watched both 12-episode cours.
The season accordion showed episodes 1 through 24 watched.

Simkl stores each anime cour as a separate library entry. The accordion's
canonical episode-state lookup already combines entries sharing the TMDB show
ID, but the header and progress tile read only the first matching entry.

`findLibraryProgress` uses the same entry selection as the episode-state
lookup and sums the anime entries' provider-reported watched counts for a
TV-shaped item. An ANIME item still resolves only its exact cour. Anime films
are excluded from the TV merge. If an ordinary TV entry also tracks the show,
take the larger TV or combined-anime count rather than adding both.

The count deliberately does not use inferred episode checkmarks. Completed
Simkl entries may omit episode rows, and one completed cour is not evidence
that every episode in a shared canonical season has been watched.

The watched line, progress tile, and Simkl watched-info hook share this lookup
through the existing library query cache. No additional provider request is
needed. The owner's live account was not accessible during this fix; the
two-cour regression is verified with a normalized library fixture.
