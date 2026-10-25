# Ratings stay in their fallback after a failed request

The details screen's `resetKey` remounts a failed section, but TanStack's
suspense query still holds its error and does not retry on mount. Refreshing
only active queries misses the score query after the boundary unmounts it.

Before resetting the sections, remove inactive error queries for Simkl,
Letterboxd, and Wikidata. Refetch active queries too, including Letterboxd's
film query when item resolution keeps another observer attached. Healthy
inactive entries stay cached.

Verified on the iOS simulator by placing all three score queries in error
state, observing the plain provider-link fallbacks, and invoking the details
screen's refresh handler. All three returned to success with data and mounted
observers. No provider writes or session changes were needed.
