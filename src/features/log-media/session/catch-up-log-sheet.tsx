import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { Sheet } from '@/components/sheet';
import type { LogMediaResult, LogMediaVariables } from '@/features/log-media/fan-out';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import { DEFAULT_LOG_TAGS, LogConfirmForm, LogFormFields, labels } from '@/features/log-media/log-confirm-sheet';
import { isEpisodeLog, type LogRequest } from '@/features/log-media/log-request';
import { parseTags } from '@/features/log-media/parse-tags';
import { logToastCopy } from '@/features/log-media/toast-copy';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit } from '@/features/log-media/use-log-targets';
import { useLetterboxdCompletion } from '@/features/log-media/use-letterboxd-completion';
import { LetterboxdCompletionOffer } from '@/features/log-media/letterboxd-completion-offer';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { resolveQuickLog } from '@/features/up-next/ui/quick-log-state';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import type { ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { useLogReconcileQuery } from '@/state/queries/log-reconcile';
import { upNextQueryKeys } from '@/state/queries/up-next';
import type { NormalizedMediaItem } from '@/types/media';

import { chainFailure, chainLabel } from './chain-copy';
import { catchUpEpisodeCode, catchUpQueue, type CatchUpEpisode } from './queue';
import { useCatchUpControls, useCatchUpLog } from './state';
import { useCatchUpEvidence } from './use-catch-up-evidence';
import { useEpisodeLogQueue } from './use-episode-log-queue';

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
 * Every logging trigger opens this app-level host, mounted in `app/_layout.tsx`.
 * Keyed on the session id so every opening starts a fresh chain; the retired
 * session stays mounted (hidden) until the next open so its late write
 * results can still report.
 */
export function CatchUpLogSheet() {
  const { session, open } = useCatchUpLog();
  if (session == null) return null;
  return <LogSessionSheet key={session.id} open={open} request={session.request} />;
}

/** One app-level logging drawer around the session's sheet-agnostic content. */
function LogSessionSheet({ request, open }: { request: LogRequest; open: boolean }) {
  const { closeCatchUp } = useCatchUpControls();
  return (
    <Sheet onClose={closeCatchUp} open={open}>
      <LogSheetContent onClose={closeCatchUp} open={open} request={request} />
    </Sheet>
  );
}

/**
 * A logging session's content without the drawer around it — the app-level
 * sheet above, or the card-actions sheet in place of its rows (the watchlist
 * picker's plan 0032 U3 shape): a second native drawer can't co-present over
 * the first, so the form swaps in instead.
 */
export function LogSheetContent({ request, open, onClose, onDismiss, onOpenRequest }: {
  request: LogRequest;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** Renders a follow-up request inline, like `onClose`'s host does. */
  onOpenRequest?: (request: LogRequest) => void;
}) {
  if (!isEpisodeLog(request)) {
    return <LogConfirmForm onClose={onClose} onDismiss={onDismiss} onOpenRequest={onOpenRequest} open={open} request={request} />;
  }
  return request.entry != null
    ? <QuickCatchUpForm entry={request.entry} onClose={onClose} onDismiss={onDismiss} onOpenRequest={onOpenRequest} open={open} />
    : <EpisodeCatchUpForm onClose={onClose} onDismiss={onDismiss} onOpenRequest={onOpenRequest} open={open} request={request} />;
}

function QuickCatchUpForm({ entry, open, onClose, onDismiss, onOpenRequest }: { entry: UpNextEpisodeEntry; open: boolean; onClose: () => void; onDismiss?: () => void; onOpenRequest?: (request: LogRequest) => void }) {
  const evidence = useCatchUpEvidence(entry);
  const queue = evidence.status === 'ready' ? catchUpQueue(entry, evidence.evidence) : null;
  return <CatchUpForm item={entry.item} first={entryEpisode(entry)} queue={queue} source={entry.source} open={open} onClose={onClose} onDismiss={onDismiss} onOpenRequest={onOpenRequest} />;
}

function EpisodeCatchUpForm({ request, open, onClose, onDismiss, onOpenRequest }: { request: LogRequest; open: boolean; onClose: () => void; onDismiss?: () => void; onOpenRequest?: (request: LogRequest) => void }) {
  const queue = useEpisodeLogQueue(request);
  const first = request.episodes?.[0] ?? { number: request.entryEpisodes![0] };
  return <CatchUpForm item={request.item} first={first} queue={queue} open={open} onClose={onClose} onDismiss={onDismiss} onOpenRequest={onOpenRequest} />;
}

/**
 * One opening of the episode-log sheet (plan 0037): the confirm modal every
 * single-episode entry point uses, which — instead of closing after one write — steps to
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
function CatchUpForm({
  item,
  first,
  queue: live,
  source,
  open,
  onClose,
  onDismiss,
  onOpenRequest,
}: {
  item: NormalizedMediaItem;
  first: CatchUpEpisode;
  queue: CatchUpEpisode[] | null;
  source?: ProviderId;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRequest?: (request: LogRequest) => void;
}) {
  const queryClient = useQueryClient();
  const logMedia = useLogMedia();
  const completion = useLetterboxdCompletion(item);
  const [completionOffer, setCompletionOffer] = useState<LogRequest | null>(null);
  const { trackBusy } = useCatchUpControls();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(
    item,
  );

  const [selectedProviders, setSelectedProviders] = useState(targets);
  const [tags, setTags] = useState(DEFAULT_LOG_TAGS);
  const [liked, setLiked] = useState(false);
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
    // Inline hosts unmount the form on dismissal; outstanding writes still report.
    return () => { openRef.current = false; };
  }, [open]);

  const queue = frozen ?? live;
  const current = queue?.[index] ?? first;
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

  useLogReconcileQuery({
    ...episodeVariables(item, current),
    providers: selectedProviders,
  }, open);

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
    const followUp = completion(rows.map((row) => row.episode));
    if (followUp != null) {
      setCompletionOffer({ ...followUp, watchedAt: watchedAt?.toISOString(), tags: parseTags(tags), liked });
      return;
    }
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
    (onDismiss ?? onClose)();
  }

  function variablesFor(episode: CatchUpEpisode): LogMediaVariables {
    const parsedTags = parseTags(tags);
    return {
      ...episodeVariables(item, episode),
      providers: selectedProviders,
      liked,
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
      item.id,
      write.then((result) =>
        (source == null || resolveQuickLog(result, source).phase === 'settling')
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
    if (awaiting || queue == null || selectedProviders.length === 0) return;
    haptics.confirm();
    const plan = queue ?? [current];
    if (frozen == null) setFrozen(plan);
    const episode = plan[index] ?? current;
    if (index >= plan.length - 1) lastFiredRef.current = true;
    fire(episode, variablesFor(episode));

    if (index >= plan.length - 1) return;
    setIndex(index + 1);
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
  // finishIfSettled ends the report when every retry lands clean.
  const [reported, setReported] = useState(false);
  if (allSettled && !allClean && !reported) setReported(true);

  return (
    <WriteSheet.Step key={completionOffer != null ? 'completion' : reported ? 'report' : 'form'}>
      {completionOffer != null ? <LetterboxdCompletionOffer request={completionOffer} onClose={onClose} onOpenRequest={onOpenRequest} /> : reported ? (
        <ChainReport
          item={item}
          landed={landed}
          ledger={ledger}
          onDone={onClose}
          onRetry={retry}
          problems={problems}
          selectedProviders={selectedProviders}
          sending={sending}
        />
      ) : (
        <>
          <WriteSheet.Header done={ledger.length > 0} onClose={onClose}>
            <MorphText className="text-2xl font-display text-foreground self-start">
              {`Log ${code}`}
            </MorphText>
            <View className="flex-row flex-wrap items-baseline gap-x-1 mt-2">
              <Text className="text-muted font-sans text-sm leading-relaxed">
                “{item.title}”
              </Text>
              {remainingCopy != null && (
                <MorphText className="text-muted font-sans text-sm leading-relaxed">
                  {`· ${remainingCopy}`}
                </MorphText>
              )}
            </View>
          </WriteSheet.Header>

            <LogFormFields
              item={item}
              manualTargets={manualTargets}
              onClose={onClose}
              onDismiss={onDismiss}
              onSelectedProvidersChange={setSelectedProviders}
              onTagsChange={setTags}
              liked={liked}
              onLikedChange={setLiked}
              onWatchedAtChange={setWatchedAt}
              pending={awaiting}
              selectedProviders={selectedProviders}
              tags={tags}
              targets={targets}
              watchedAt={watchedAt}
            />

            {/* The chain's state rides the label and morphs press to press
                (`chainLabel`). It used to be a row per fired write above the
                button — a scrolling receipt — and then a status line, which is
                still a second thing to read about what the button does. */}
            {!currentLanded && (
              <WriteSheet.Actions>
                <Button
                  variant="log"
                  disabled={selectedProviders.length === 0 || queue == null}
                  icon={<Button.Icon name="eye" />}
                  label={chainLabel(code, { landed, failed: problems.length })}
                  loading={awaiting || queue == null}
                  loadingLabel="Logging…"
                  morphLabel
                  onPress={confirm}
                />
              </WriteSheet.Actions>
            )}

            {/* The one thing the 20s Simkl write lock needs said: the queued
                legs look stalled otherwise (simkl-write-lock.ts). */}
            {simklQueued && (
              <Text className="text-muted font-sans text-xs text-center mt-3">
                Simkl takes one write every 20 seconds, so the rest wait their
                turn — keep going.
              </Text>
            )}
          </>
        )}
    </WriteSheet.Step>
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
      <WriteSheet.Header done onClose={onDone}>
        <WriteSheet.Title>
          {chainFailure(
            problems.map((row) => catchUpEpisodeCode(row.episode)),
            failedProviders,
          )}
        </WriteSheet.Title>
      </WriteSheet.Header>
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

      {retryable.length > 0 && (
        <WriteSheet.Actions>
          <Button
            variant="log"
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
        </WriteSheet.Actions>
      )}
    </>
  );
}
