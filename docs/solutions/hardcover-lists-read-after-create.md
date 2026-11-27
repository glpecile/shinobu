# Home keeps the old Hardcover lists after a create

**Symptom (2026-11-27).** After a new Hardcover list was created from a book's
details, Home's Hardcover lists row still showed the old set. A pull to refresh on
View all showed the new list.

## Cause

`useCreateList` invalidates `hardcoverQueryKeys.listsRoot()`, and that
refetches Home's row even with a details screen on top (checked on the iPhone
17 Pro simulator: `dataUpdatedAt` moved after the invalidation). So the refetch
ran, and Hardcover's `me { lists }` answered it without the list it had just
created. A later read included it.

Not measured: how long Hardcover takes to show a new list in `me.lists`. No
agent sends a Hardcover mutation, so this was inferred from the client side.

## Fix

After the invalidation, `addCreatedHardcoverList`
(`state/queries/list-membership.ts`) reads the new list by id through
`hardcoverListQuery`, the read the list screen needs next, and puts it first in
the `created` index when the index lacks it. The list screen reuses that cache
entry, so the create adds no request.

`bookLists` now sits under `listsRoot()`, so a list write also refreshes a
book's "Lists" section.
