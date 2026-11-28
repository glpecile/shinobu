# List rename completion needs a stable mounted owner

A list save must still confirm after the user dismisses its sheet. TanStack
Query's per-call `mutate` callbacks run only while the mutation observer has a
listener. Keep the mutation in the toolbar component, outside the conditional
form, so dismissing the sheet does not detach that listener.

The toolbar's React key must identify the list, rather than its title. A
successful rename can update the title before awaited invalidation finishes;
keying the toolbar by that title remounts its observer before its completion
callback can toast, close the sheet, or follow a changed Letterboxd slug.
The conditional form already creates a fresh draft each time it opens.

Hardcover can also change a list's slug when renamed. Use its stable list id
for the mutation key and serialization scope, since changing a mutation key
resets the observer. Membership edits and renames share that scope so their
writes remain serialized while the list's URL changes.

`src/state/queries/list-membership.test.tsx` exercises a local stubbed rename,
changes the target title and URL during invalidation, and verifies that the
completion callback still runs. It sends no provider request.
