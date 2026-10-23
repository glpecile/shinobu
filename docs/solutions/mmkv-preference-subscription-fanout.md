# MMKV preference subscriptions invalidated unrelated snapshots

## Symptom

Collapsing a home section recreated hidden-item and hidden-list arrays and the
collapsed-diary-day Set. Their consumers could refilter feeds and lists even
though none of those preferences had changed.

## Cause and fix

MMKV's value-change listener reports every changed key in the shared `prefs`
instance. The hidden-items subscription cleared both cached arrays for every
event, and collapsed-diary-days reread every stored day for every event.

Filter the event key at each subscription. Hidden items invalidate only their
matching item/list prefix; collapsed days rebuild only for their own prefix.
The stable snapshot references let `useSyncExternalStore` skip unrelated updates.
Storage keys, persistence formats and explicit preference setters are unchanged.

`compareBeforeSet` is not a substitute: installed MMKV 4.3.2's native `set`
still invokes its change listeners, and the web implementation does too.

## Verification

The mounted-hook regression in `state/prefs/hidden-items.test.ts` failed first
on the hidden arrays and then, after fixing those, on the collapsed-day Set.
It now preserves all three snapshots for an unrelated section write while
relevant additions and removals still update them. No device frame-time gain
is claimed.
