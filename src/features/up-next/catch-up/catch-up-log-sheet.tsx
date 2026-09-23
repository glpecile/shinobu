import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Keyframe } from 'react-native-reanimated';

import { AnimatedView } from '@/components/animated-view';
import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { Sheet } from '@/components/sheet';
import type { LogMediaResult, LogMediaVariables } from '@/features/log-media/fan-out';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { LogFormFields, labels } from '@/features/log-media/log-confirm-sheet';
import { parseTags } from '@/features/log-media/parse-tags';
import { logToastCopy } from '@/features/log-media/toast-copy';
import {
  prefetchLogReconcile,
  useLogMedia,
} from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { resolveQuickLog } from '@/features/up-next/ui/quick-log-state';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { DURATION, KEYFRAME_EASE_OUT } from '@/lib/motion';
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { useConnectedProviders } from '@/state/session';
import type { NormalizedMediaItem } from '@/types/media';

import { chainFailure, chainLabel } from './chain-copy';
import { catchUpEpisodeCode, catchUpQueue, type CatchUpEpisode } from './queue';
import { useCatchUpControls, useCatchUpLog } from './state';
import { useCatchUpEvidence } from './use-catch-up-evidence';

const DEFAULT_TAGS = 'shinobu, ';

/**
 * The header's native entrance when the chain advances: a short slide in from
 * the right, the direction "next" reads in. Native only — on web the title is
 * a `MorphText` that morphs in place (the digit slides, the rest stays), and a
 * remount there would throw that morph away. Module scope, per Reanimated's
 * animation-builder performance rule.
 */
const HEADER_SLIDE = 12;
const headerEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: HEADER_SLIDE }] },
  100: {
    opacity: 1,
    transform: [{ translateX: 0 }],
    easing: KEYFRAME_EASE_OUT,
  },
}).duration(DURATION.swap);

interface LedgerRow {
  episode: CatchUpEpisode;
  status: 'pending' | 'done' | 'error';
  result?: LogMediaResult;
  message?: string;
}

const sameEpisode = (a: CatchUpEpisode, b: CatchUpEpisode) =>
  a.season === b.season && a.number === b.number;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Which legs a retry re-fires: every selected provider when the write itself
 * threw, only the failed ones when the report names them (a Trakt leg that
 * landed is not logged twice). Null when the row has nothing to retry.
 */
function retryProviders(
  row: LedgerRow,
  selected: readonly ProviderId[],
): readonly ProviderId[] | null {
  if (row.status === 'error') return selected;
  if (row.status === 'done' && row.result != null && row.result.failed.length > 0) {
    return row.result.failed;
  }
  return null;
}

/**
 * The reasons across every landed row, one line per distinct
 * provider/status/text — a chain that fails N times on one dead Simkl session
 * has one thing to say, not N copies of it. Plain successes and reconcile
 * skips have no reason to show; the row line already carries them.
 */
function distinctReasons(rows: readonly LedgerRow[]): ProviderWriteOutcome[] {
  const seen = new Map<string, ProviderWriteOutcome>();
  for (const row of rows) {
    for (const outcome of row.result?.outcomes ?? []) {
      const text = outcome.status === 'error' ? outcome.message : outcome.reason;
      if (text == null) continue;
      const key = `${outcome.provider}:${outcome.status}:${text}`;
      if (!seen.has(key)) seen.set(key, outcome);
    }
  }
  return [...seen.values()];
}

/**
 * Which numbering domain the episode lives in (plan 0027 KTD2): a seasoned
 * pointer carries its canonical season; an entry-relative one has none to
 * carry, and the fan-out resolves the season from ani.zip. Never fabricate a
 * `season: 1`.
 */
function episodeVariables(
  item: NormalizedMediaItem,
  episode: CatchUpEpisode,
): Pick<LogMediaVariables, 'item' | 'episodes' | 'entryEpisodes'> {
  return episode.season != null
    ? { item, episodes: [{ season: episode.season, number: episode.number }] }
    : { item, entryEpisodes: [episode.number] };
}

function entryEpisode(entry: UpNextEpisodeEntry): CatchUpEpisode {
  const { season, number, title } = entry.episode;
  return {
    ...(season != null ? { season } : {}),
    number,
    ...(title != null ? { title } : {}),
  };
}

/**
 * The app-level host, mounted once in `app/_layout.tsx` beside the lightbox.
 * Keyed on the session id so every opening starts a fresh chain; the retired
 * session stays mounted (hidden) until the next open so its late write
 * results can still report.
 */
export function CatchUpLogSheet() {
  const { session, open } = useCatchUpLog();
  if (session == null) return null;
  return <CatchUpSession key={session.id} entry={session.entry} open={open} />;
}

/**
 * One opening of the quick-log sheet (plan 0037): the confirm modal every
 * log entry point uses, which — instead of closing after one write — steps to
 * the show's next aired-but-unwatched episode with the same providers, date
 * and tags, until the backlog is done.
 *
 * The chain is *planned* once, at the first confirm, from what the source can
 * prove (`catchUpQueue`), and never re-derived mid-chain: the refetches each
 * write triggers would otherwise shift the queue under the user's thumb.
 *
 * Writes are not awaited per episode. A confirm fires this episode's
 * `useLogMedia` fan-out and moves the form straight to the next one; each
 * fired write reports into the ledger below the form as it lands. **The last
 * episode is awaited** like a single log always was — button spinner, close
 * on a clean report, stay open on anything else — so a one-episode chain is
 * exactly the pre-0037 sheet, and a long one ends with every outcome visible.
 * Simkl is why the sheet can't simply await each write: its ~20s per-user
 * write lock means the second through last Simkl legs coalesce into one POST
 * that lands when the lock lifts (`features/log-media/simkl-write-lock.ts`).
 *
 * Nothing advances optimistically (plan 0019 KTD-6): the card behind the
 * sheet spins until its slot's awaited invalidation resolves, and moves only
 * from recomputed data. The sheet is the plan; the feed is the truth.
 */
function CatchUpSession({
  entry,
  open,
}: {
  entry: UpNextEpisodeEntry;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const connected = useConnectedProviders();
  const logMedia = useLogMedia();
  const { closeCatchUp, trackBusy } = useCatchUpControls();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(
    entry.item,
  );
  const evidence = useCatchUpEvidence(entry);

  const [selectedProviders, setSelectedProviders] = useState(targets);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  /** The chain, frozen at the first confirm (see the component docblock). */
  const [frozen, setFrozen] = useState<CatchUpEpisode[] | null>(null);
  const [index, setIndex] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  // The write handlers below outlive renders; they read the sheet's current
  // visibility to decide between the ledger (open) and a toast (dismissed).
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const live =
    evidence.status === 'ready' ? catchUpQueue(entry, evidence.evidence) : null;
  const queue = frozen ?? live;
  const current = queue?.[index] ?? entryEpisode(entry);
  const code = catchUpEpisodeCode(current);
  const remaining = queue == null ? null : queue.length - index - 1;
  const lastConfirmed =
    frozen != null && ledger.some((row) => sameEpisode(row.episode, frozen[frozen.length - 1]));
  const currentRow = ledger.find((row) => sameEpisode(row.episode, current));
  const awaiting = lastConfirmed && currentRow?.status === 'pending';
  // A re-press on the last episode is its retry — but only while it needs
  // one. Once it landed clean (and an earlier row is what keeps the sheet
  // open), offering "Log episode 5" again would just log it twice.
  const currentLanded =
    currentRow?.status === 'done' &&
    currentRow.result != null &&
    isCleanWriteReport(currentRow.result);
  const allSettled =
    lastConfirmed && ledger.every((row) => row.status !== 'pending');
  const allClean =
    allSettled &&
    ledger.every(
      (row) => row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
    );

  // Warm the reconcile reads while the user reads the sheet (plan 0019), so
  // the first confirm doesn't wait on cold fetches.
  useEffect(() => {
    void prefetchLogReconcile(queryClient, connected, {
      ...episodeVariables(entry.item, entryEpisode(entry)),
    });
    // Once, on open — later episodes are warmed as the chain advances.
  }, []);

  // The write handlers read the ledger as of the latest landing, not their
  // render's snapshot.
  const ledgerRef = useRef<LedgerRow[]>([]);
  /** Set once the chain's last episode has been confirmed. */
  const lastFiredRef = useRef(false);

  // The chain's end: every queued episode confirmed and every write settled.
  // Clean all round → close and announce; otherwise the sheet stays, the
  // ledger naming what needs a hand (plan 0032 R7: a failure keeps its links).
  // Runs on every landing, so a retry that lands clean ends the chain too.
  function finishIfSettled(rows: LedgerRow[]) {
    if (!lastFiredRef.current) return;
    if (!openRef.current) return; // dismissed early — the rows already toasted
    if (rows.some((row) => row.status === 'pending')) return;
    const clean = rows.every(
      (row) => row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
    );
    if (!clean) return;
    if (rows.length > 1) {
      const succeeded = new Set(rows.flatMap((row) => row.result?.succeeded ?? []));
      toast.success(
        'Caught up',
        `Logged ${rows.length} episodes to ${labels([...succeeded])}`,
      );
    } else {
      const only = rows[0]?.result;
      if (only != null) {
        const copy = logToastCopy(only);
        toast.success(copy.title, copy.message);
      }
    }
    closeCatchUp();
  }

  function variablesFor(episode: CatchUpEpisode): LogMediaVariables {
    const parsedTags = parseTags(tags);
    return {
      ...episodeVariables(entry.item, episode),
      providers: selectedProviders,
      ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
    };
  }

  function record(episode: CatchUpEpisode, row: Omit<LedgerRow, 'episode'>) {
    const rows = [
      ...ledgerRef.current.filter((existing) => !sameEpisode(existing.episode, episode)),
      { episode, ...row },
    ];
    ledgerRef.current = rows;
    setLedger(rows);
    return rows;
  }

  /** One episode's write: a pending row, the fan-out, the card's settle signal, the landing. */
  function fire(episode: CatchUpEpisode, variables: LogMediaVariables) {
    const episodeCode = capitalize(catchUpEpisodeCode(episode));
    // A re-fire (the last episode's re-press, a retry) replaces the old row.
    record(episode, { status: 'pending' });
    const write = logMedia.mutateAsync(variables);

    // The card's settle signal (docs/solutions/quick-log-settle-refresh-to-update.md):
    // once the source provider landed (or already had it), await the slot's
    // own refetch; resolving *is* "the recomputed data is in".
    trackBusy(
      entry.item.id,
      write.then((result) =>
        resolveQuickLog(result, entry.source).phase === 'settling'
          ? queryClient.invalidateQueries(
              { queryKey: upNextQueryKeys.inputs() },
              { cancelRefetch: false },
            )
          : undefined,
      ),
    );

    write.then(
      (result) => {
        finishIfSettled(record(episode, { status: 'done', result }));
        const clean = isCleanWriteReport(result);
        if (openRef.current) {
          if (!clean) haptics.error();
          return;
        }
        // Dismissed before this landed: the toast is the only surface left.
        if (clean) {
          const copy = logToastCopy(result);
          toast.success(`${copy.title} ${episodeCode.toLowerCase()}`, copy.message);
        } else {
          toast.error(
            `${episodeCode} failed on ${labels(result.failed)}`,
            result.succeeded.length > 0 ? `${labels(result.succeeded)} was logged.` : undefined,
          );
        }
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not log.';
        record(episode, { status: 'error', message });
        if (openRef.current) haptics.error();
        else toast.error(`${episodeCode} was not logged`, message);
      },
    );
  }

  function confirm() {
    if (awaiting || selectedProviders.length === 0) return;
    haptics.confirm();
    const plan = queue ?? [current];
    if (frozen == null) setFrozen(plan);
    const episode = plan[index] ?? current;
    if (index >= plan.length - 1) lastFiredRef.current = true;
    fire(episode, variablesFor(episode));

    if (index >= plan.length - 1) return;
    setIndex(index + 1);
    const next = plan[index + 1];
    if (next != null) {
      void prefetchLogReconcile(queryClient, connected, variablesFor(next));
    }
  }

  // Every failed row re-fires at once: the Simkl legs coalesce into one POST
  // (simkl-write-lock.ts), so N retries cost the same lock wait as one.
  function retry() {
    haptics.confirm();
    for (const row of ledger) {
      const providers = retryProviders(row, selectedProviders);
      if (providers == null) continue;
      fire(row.episode, { ...variablesFor(row.episode), providers: [...providers] });
    }
  }

  const remainingCopy =
    remaining == null || (remaining === 0 && queue?.length === 1)
      ? null
      : remaining === 0
        ? 'last one'
        : `${remaining} more after this`;

  const problems = ledger.filter(
    (row) =>
      row.status === 'error' ||
      (row.status === 'done' && row.result != null && !isCleanWriteReport(row.result)),
  );
  const landed = ledger.filter(
    (row) =>
      row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
  ).length;
  const sending = ledger.filter((row) => row.status === 'pending').length;
  const simklQueued =
    selectedProviders.includes('simkl') && ledger.length > 1 && sending > 0;

  // The sheet is a drawer, so it shows exactly one view. The form is the view
  // until the chain has settled with something still needing a hand — a clean
  // chain closes itself and becomes a toast. Latched, because a retry
  // un-settles the ledger and must not throw the user back to the form; the
  // clean-close effect above is what ends the report.
  const [reported, setReported] = useState(false);
  if (allSettled && !allClean && !reported) setReported(true);

  return (
    <Sheet onClose={closeCatchUp} open={open}>
      <WriteSheet.Step key={reported ? 'report' : 'form'}>
        {reported ? (
          <ChainReport
            item={entry.item}
            landed={landed}
            ledger={ledger}
            onDone={closeCatchUp}
            onRetry={retry}
            problems={problems}
            selectedProviders={selectedProviders}
            sending={sending}
          />
        ) : (
          <>
            <AnimatedView
              // Native: each episode's header slides in. Web: the same element
              // stays mounted and the title morphs (see `headerEntering`).
              key={Platform.OS === 'web' ? 'header' : code}
              entering={index > 0 ? headerEntering : undefined}
            >
              <MorphText className="text-2xl font-display text-foreground self-start">
                {`Log ${code}`}
              </MorphText>
              <View className="flex-row flex-wrap items-baseline gap-x-1 mt-2">
                <Text className="text-muted font-sans text-sm leading-relaxed">
                  “{entry.item.title}”
                </Text>
                {remainingCopy != null && (
                  <MorphText className="text-muted font-sans text-sm leading-relaxed">
                    {`· ${remainingCopy}`}
                  </MorphText>
                )}
              </View>
            </AnimatedView>

            <LogFormFields
              item={entry.item}
              manualTargets={manualTargets}
              onClose={closeCatchUp}
              onSelectedProvidersChange={setSelectedProviders}
              onTagsChange={setTags}
              onWatchedAtChange={setWatchedAt}
              pending={awaiting}
              selectedProviders={selectedProviders}
              tags={tags}
              targets={targets}
              watchedAt={watchedAt}
            />

            {/* The one thing the 20s Simkl write lock needs said: the queued
                legs look stalled otherwise (simkl-write-lock.ts). */}
            {simklQueued && (
              <Text className="text-muted font-sans text-xs mt-5">
                Simkl takes one write every 20 seconds, so the rest wait their
                turn — keep going.
              </Text>
            )}

            {/* The chain's state rides the label and morphs press to press
                (`chainLabel`). It used to be a row per fired write above the
                button — a scrolling receipt — and then a status line, which is
                still a second thing to read about what the button does. */}
            <WriteSheet.Actions>
              {!currentLanded && (
                <Button
                  disabled={selectedProviders.length === 0}
                  icon={<Button.Icon name="eye" />}
                  label={chainLabel(code, { landed, failed: problems.length })}
                  loading={awaiting}
                  loadingLabel="Logging…"
                  morphLabel
                  onPress={confirm}
                />
              )}
              <Button
                // Nothing written yet, so leaving is a dismissal; once a row has
                // landed the same button is the end of the chain.
                icon={<Button.Icon name={ledger.length > 0 ? 'checkmark' : 'close'} />}
                label={ledger.length > 0 ? 'Done' : 'Cancel'}
                morphLabel
                onPress={closeCatchUp}
                variant="quiet"
              />
            </WriteSheet.Actions>
          </>
        )}
      </WriteSheet.Step>
    </Sheet>
  );
}

/**
 * The chain's other view: what needs a hand. One headline naming the episodes
 * and the provider that dropped them, one muted line for what *did* land, the
 * shared reasons-and-manual-links report (never a dead end, plan 0022), and
 * the retry.
 */
function ChainReport({
  item,
  landed,
  ledger,
  onDone,
  onRetry,
  problems,
  selectedProviders,
  sending,
}: {
  item: NormalizedMediaItem;
  landed: number;
  ledger: readonly LedgerRow[];
  onDone: () => void;
  onRetry: () => void;
  problems: readonly LedgerRow[];
  selectedProviders: readonly ProviderId[];
  sending: number;
}) {
  const failedProviders = [
    ...new Set(problems.flatMap((row) => row.result?.failed ?? [])),
  ];
  const succeededProviders = [
    ...new Set(ledger.flatMap((row) => row.result?.succeeded ?? [])),
  ];
  const thrown = [
    ...new Set(
      ledger.flatMap((row) =>
        row.status === 'error' ? [row.message ?? 'Could not log.'] : [],
      ),
    ),
  ];
  const retryable = ledger.filter(
    (row) => retryProviders(row, selectedProviders) != null,
  );

  return (
    <>
      <WriteSheet.Title>
        {chainFailure(
          problems.map((row) => catchUpEpisodeCode(row.episode)),
          failedProviders,
        )}
      </WriteSheet.Title>
      {landed > 0 && succeededProviders.length > 0 && (
        <WriteSheet.Description>
          {`${landed} ${landed === 1 ? 'episode' : 'episodes'} reached ${labels(succeededProviders)}.`}
        </WriteSheet.Description>
      )}

      {/* No top margin here: `WriteResultReport` brings its own (`mt-3`), and
          a wrapper adding a second one is how the headline ended up floating. */}
      <View className="gap-1">
        {thrown.map((message) => (
          <Text className="text-accent font-sans text-xs mt-3" key={message}>
            {message}
          </Text>
        ))}
        <WriteResultReport
          item={item}
          outcomes={distinctReasons(problems)}
          reconcileLine={(skipped) =>
            `${labels(skipped)} already had this logged — skipped to keep both in sync.`
          }
        />
      </View>

      <WriteSheet.Actions>
        {retryable.length > 0 && (
          <Button
            icon={<Button.Icon name="refresh" />}
            label={
              retryable.length === 1
                ? capitalize(`retry ${catchUpEpisodeCode(retryable[0]!.episode)}`)
                : `Retry ${retryable.length} episodes`
            }
            loading={sending > 0}
            loadingLabel="Retrying…"
            onPress={onRetry}
          />
        )}
        <Button
          icon={<Button.Icon name="checkmark" />}
          label="Done"
          onPress={onDone}
          variant="quiet"
        />
      </WriteSheet.Actions>
    </>
  );
}
