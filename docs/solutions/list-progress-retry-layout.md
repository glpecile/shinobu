# List progress retry stays inline and reports refetching

The list header places its author and progress metadata in one wrapping row.
A column inside `ListProgress` stacked Retry under the count, centering the
short author label beside the taller stack. Keep the count and compact retry
button in one wrapping row. Show the determinate ring only with ready history;
a failed read cannot establish a watched total.

TanStack Query can retain cached data after a failed refetch. A subsequent
retry has `isFetching: true` while `isPending` remains false. The shared progress
read includes both flags in its busy state, so the retry control shows its
spinner and blocks presses until the request settles. A regression test uses a
real query client with cached data, a failed read, and a deferred retry.
