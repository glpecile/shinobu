# Letterboxd entries without a TMDB movie identity

The public `/film/beast-boy-lone-wolf/` page responds with normal film HTML,
but its body has `data-tmdb-type="movie" data-tmdb-id=""`. The corresponding
TMDB record is TV 228880. A movie-only search cannot enrich this entry, and
using that TV number as a movie external ID would address an unrelated movie.

Resolve a unique exact title/year match and keep the TV relationship separate
from provider identity. It supplies display metadata and variant navigation,
not episode progress or write targets. Public film GETs are already allowlisted
by the web proxy (plan 0066); the former native-only ID lookup gate is obsolete.
