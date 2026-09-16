# Person page errors with TMDB 500 for some people

## Symptom

(owner, 2026-09-16.) `/person/71070` (Amanda Seyfried) fell to the route error
boundary: `tmdb: network error — TMDB responded 500 for
/person/71070?append_to_response=combined_credits`. Other people loaded fine.

## Cause

TMDB-side, and deterministic, not a blip. With a valid token, 3 of 3 retries:

```
500  /person/71070?append_to_response=combined_credits
200  /person/71070
200  /person/71070/combined_credits
200  /person/287?append_to_response=combined_credits
```

The append fails for this person; each half on its own doesn't.

## Fix

`getPerson` (`lib/providers/tmdb/reads.ts`) sends the two requests in parallel
and puts `combined_credits` back on the person before normalizing. Costs one
more request per person page, and the response shape doesn't change.
