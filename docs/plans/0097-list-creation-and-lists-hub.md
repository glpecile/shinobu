# Create lists, and a lists view worth opening

## Scope

Create a Letterboxd or Serializd list from Shinobu, with Letterboxd's editor as
the model: name, description, tags (Letterboxd), sharing, ranked, comments
(Serializd), and the first films or shows picked through the list search that
membership editing already ships. Saving replaces the form with the new list.

Reinvent the list card as a fanned poster stack with the title below it, as
Letterboxd shows lists. The created index and the home "Your Lists" rail open the
editor from a leading New list tile, so a member with no lists still has an
entry point. An empty created index offers New list beside its provider link.

Long-pressing a list (or its ⋯ on web hover) opens a sheet, like a credit's: the
poster stack, title, owner and count, then Open list, Like (another member's
Letterboxd list), Share, and View on the provider.

No reordering, deletion, collaborators, banners, per-entry notes,
or season/episode entries. On web, Letterboxd creation runs through userscript
0.9.0 (bridge 10); an older script offers the install and Create on Letterboxd.

## Provider findings

2026-10-20, from the shipped clients (no account was changed):

Letterboxd's `ListEditor` chunk `BP__F_Ra.js` creates through the same API
client as its edits: `POST /api/v0/lists` (`Djh7ueVS.js`, base URI
`window.baseURL + '/api/v0'`, `X-CSRF-TOKEN` from `supermodelCSRF` on every
non-GET in `DNubDeBx.js`). The body is `{ published, name, sharePolicy, ranked,
description, tags, entries }`. `entries` uses the edit's operations,
`{ action: 'ADD', listable: filmLid }`. Public sends `published: true` with
`sharePolicy: 'You'`; otherwise `published: false` with `Anyone`, `Friends`, or
`You`. A 200 carries `messages` (any `type: 'Error'` fails, `DuplicateEntry`
included) and `data` with `id`, `version`, and `links` whose `letterboxd` URL is
the new list.

Serializd's `/list/create` page posts `POST /api/list/create` with
`{ list_name, list_description, list_items, list_collaborators, is_private,
is_ranked, allows_comments, banner_image_path }`, items as `{ show_id,
season_id, position, episode_number, description }`. It answers `{ listId }`.
The editor requires a name and at least one item, caps items at 500, and
defaults to public, ranked, and no comments. Add only the exact
`list/create` POST to the Serializd Worker allowlist.

## Validation

Provider tests for the create payloads, ownership, rejected receipts, and the
Worker allowlist. Run repository checks and a web export, then exercise the
editor, the new tiles, and the list sheet on the running app with writes
intercepted. JavaScript-only; hot reloads.

## Result

Implemented as planned. The iOS simulator (worktree Metro) verified the empty
created index, the liked grid's poster stacks, the long-press sheet with its
like state, both editor variants, multi-pick search with ranked numbering,
validation, and the home rail's New list tile for a member with no lists. No
list was created: the create effects, script, and proxy grant are covered by
tests only. Picking several titles exposed recycled search rows holding an old
`onSelect`; the editor updates its picks functionally and the rows take
`extraData`. Android and web remain unverified. JavaScript-only; hot reloads.

Follow-up, same day: owners can rename a list from its toolbar. Serializd saves
through the full editor and refuses a partial list. Letterboxd PATCHes from the
list's edit page, resending the `data-list-*` settings its editor renders, and
follows a new slug if the name changes it. Web renames need userscript 0.9.1
(bridge 11); bridge 10 can create but not rename.
The editor validates with one Zod schema (`features/lists/new-list-schema.ts`)
through react-hook-form: Serializd's name and 1–500 shows, Letterboxd's
lowercased, de-duplicated tags, and the userscript's caps (name 500, description
10,000, 100 tags of 200, 50 films). Errors show on submit, then follow each edit.
