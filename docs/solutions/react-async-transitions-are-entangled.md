# React 19 joins concurrent async transitions

Issue #498. Seen in `CatchUpLogProvider` with React 19.3.

## Symptom

Each episode log held its optimistic state in `useOptimistic`, inside
`startTransition(async () => { add(watch); await work })`.

- In a catch-up chain, a failed episode went back only when the last episode
  in flight settled.
- A pull-to-refresh started during a log spun until the log's refetches
  ended. `components/refresh-control` reads `isPending` from `useTransition`.

## Cause

React keeps one scope for all async actions (`entangleAsyncAction` in the
reconciler). A new async transition joins the scope of any that is still
pending, and the scope ends only when its last action settles. Until then,
every `useOptimistic` value set in the scope stays, and every `isPending` in
it stays true. There is no option to keep one action out of the scope.

## Fix

Hold each log in its own TanStack mutation, which settles alone.
`trackLog` starts a `logged-watch` mutation whose `mutationFn` returns the
log's work, and `useMutationState` reads the pending ones. This also follows
the rule that a promise's pending state comes from `useMutation`.

Use an async transition only for one action whose `isPending` the same
component shows, such as a button press. Never use one for state that must
end with its own promise while other actions run.

`features/log-media/session/state.test.tsx` starts two logs and fails the
first. The test fails with `useOptimistic`.
