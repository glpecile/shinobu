# Settings and grouped rows

## Scope

- Rename the Manage Trackers view and `/connect` route to Settings and `/settings`.
- Update navigation and the OAuth landing route to use Settings.
- Put connected trackers, available trackers, and hidden items in one bordered
  box per section, with inset dividers between rows.
- Replace the Accounts heading with Available trackers.
- Share the box and divider styling through `components/grouped-list.tsx`.
- Keep connection actions and provider behavior unchanged.

## Validation

Run lint, typecheck, and the class-name and navigation checks. Check the web
layout at desktop and phone widths. The README has no screenshot of this view;
its existing navigation screenshots already use Settings.
