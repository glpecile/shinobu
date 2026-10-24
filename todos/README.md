# Backlog reconciliation

Checked 2026-10-23 against local commit `28b414a`, current source, project docs,
and live GitHub issue/PR state. This is a source and history review, not a new
device or provider QA pass. Historical validation records remain dated.

## Local todos

There are 22 numbered todos: 15 done, two in progress, and five pending.
Done means the scoped implementation is complete; remaining runtime coverage
is listed separately below. Filenames and frontmatter now agree.

| Todo | State | What remains |
| --- | --- | --- |
| [002 AniList](002-in-progress-p2-anilist-integration.md) | In progress, P2 | Owner registration of bundled native/web client IDs, then fresh connection and cross-provider logging/reconciliation QA. IDs are still empty. |
| [003 token storage](003-pending-p2-secure-token-storage.md) | Pending, P2 | Key custody, migration of existing sessions, and web storage review. Native session MMKV still has no encryption key. |
| [010 write-path naming](010-pending-p3-rename-fan-out-concept.md) | Pending, P3 | Naming decision, then a separate mechanical rename. No behavior change. |
| [019 native controls](019-in-progress-p3-native-expo-ui-opportunities.md) | In progress, P3 | Distant-year, larger-text and screen-reader checks. Title-copy menus remain a proposal; rejected migrations stay rejected. |
| [020 tracking proposals](020-pending-p2-tracking-workflow-improvements.md) | Pending, P2 | Pause/drop #227 is the next scoped feature. Ratings need a separate spike. Other proposals are not one implementation batch. |
| [021 Android abort](021-pending-p1-android-shadow-tree-abort.md) | Pending, P1 | Reproduce the old ShadowTree assertion with a current matching binary. The separate WorkManager release fix does not close it. |
| [022 form validation](022-pending-p3-zod-form-validation.md) | Pending, P3 | Rename/log-confirm form migration and the proposed lint rule. Both still use local form state. Verify provider limits first. |

Completed todos are 001, 004–009, 011–018. In particular, 016's Simkl cour fix
was already done and owner-verified; only its filename still said pending.
Todo 011 is the completed GET-only Letterboxd proxy, not a request to proxy writes.

## GitHub issues

| Issue | Reconciled scope | Next step |
| --- | --- | --- |
| [#201 Simkl AUTH V2](https://github.com/glpecile/shinobu/issues/201) | Open. Current source still uses V1 authorization/token handling with no refresh grant. | Revalidate the official migration deadline/contracts, arrange a V2 client, then plan refresh, V1-session migration and quota handling. Do not treat the issue's older upstream snapshot as newly verified. |
| [#208 offline](https://github.com/glpecile/shinobu/issues/208) | Open, partial. Allowlisted cached reads persist; durable write replay does not ship. | Plan the smallest restart-safe action with per-provider outcomes and account/duplicate protections. Verify actual offline-read coverage. |
| [#209 reading](https://github.com/glpecile/shinobu/issues/209) | Open discovery. AniList manga write support is not an integrated book/reading experience. | Provider access/CORS/write feasibility spike before selecting a service. |
| [#211 widgets](https://github.com/glpecile/shinobu/issues/211) | Closed as not planned. Evaluation complete; adoption deferred for the evaluated package. | Reopen after a supported upstream contract satisfies plan 0101's blockers. Notification grouping/muting shipped separately in #290. |
| [#226 sorting](https://github.com/glpecile/shinobu/issues/226) | Closed. #254 shipped sorting; #265 replaced runtime choices with alphabetical choices. | No runtime-sort restoration. Current modes are original order, title and release year. |
| [#227 pause/drop](https://github.com/glpecile/shinobu/issues/227) | Open, overlaps todo 020 candidate A. | Verify status-only writes preserve progress/history, then write a focused plan. No separate Resume action. |
| [#248 recycled hover](https://github.com/glpecile/shinobu/issues/248) | Open investigation, not a confirmed defect. | Reproduce in a browser before changing shared row state. |
| [#249 log busy endpoint](https://github.com/glpecile/shinobu/issues/249) | Open policy decision and investigation. | Decide provider-acceptance versus displayed-data completion, then test delayed reads. Preserve accepted-write outcomes. |
| [#250 hidden identity](https://github.com/glpecile/shinobu/issues/250) | Open policy decision and investigation. | Decide provider-copy versus media-wide hiding, then reproduce across source changes. No speculative storage migration. |

## Next work

The owner selected pause/drop tracking in #227 as the next feature and deferred
Simkl AUTH V2 for now. Start with provider-contract verification and a focused
plan; this documentation PR does not implement the feature.

Other open work remains separate:

1. Reproduce or narrow Android todo 021 on the current build. Keep release
   WorkManager startup checks distinct from the React Native commit assertion.
2. Review token storage in 003 before changing persisted sessions. Define the
   migration before enabling encryption.
3. Finish AniList setup when owner client registration is available, and run
   the outstanding QA below. Form validation 022 is a smaller independent task.
4. Revisit Simkl V2 in #201 when selected. Verify the upstream deadline and
   requirements before planning; the old issue snapshot is not current evidence.

Naming, optional native copy menus, search history and preference transfer
remain lower priority. Personal ratings, reading and offline writes are separate
projects. Sorting is resolved.

## Runtime checks still recorded as open

- SDK 58 plan 0100's second pass records successful iOS movie/TV logging,
  iOS list creation and Android TV logging. It still leaves Android list
  creation, an Android Letterboxd retry and fresh AniList/Simkl connections open.
  PR #289 is merged; its earlier draft checkpoint is historical.
- Todo 016's separate Link Click/AniList episode-detail follow-up has source
  and regression evidence, but its solution note still lacks live confirmation.
- Native menus in 019 need distant-year, larger-text and screen-reader checks.
- The v0.7.5 Android release note verifies APK constructors/signatures/checksums
  and local startup past WorkManager, but does not establish a complete UI pass
  of the published APK. See
  [the release fix](../docs/solutions/android-release-workmanager-constructor-stripped.md).
- Older provider todos contain historical manual-check lists. Later SDK QA
  proves some reconnect/log flows; it does not prove every original web or
  hardware criterion. Do not reopen all completed implementations as new work.

## Other code notes

The source TODO scan found no additional untracked urgent implementation task.
Serializd's missing watchlist read is an explicit v1 deferral in
`features/watchlist-media/invalidate.ts`. The recycled-hover note is covered by
#248. Fuzzy search's first-page candidate limit is a documented tradeoff, not
an agreed request to widen fetching. Further Nitro opportunities are in
`docs/brainstorms/2026-10-23-nitro-performance-audit.md`; its immediate fixes
shipped in #310, and its remaining proposals require measurement.

This reconciliation changes documentation only. No hot reload or native
rebuild is required.
