import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { MorphText } from '@/components/morph-text';
import { Sheet } from '@/components/sheet';
import type { LogMediaResult, LogMediaVariables } from '@/features/log-media/fan-out';
import type { ProviderWriteOutcome } from '@/features/log-media/fan-out';
import {
  DEFAULT_LOG_TAGS,
  LogConfirmForm,
  LogFormFields,
  labels,
} from '@/features/log-media/log-confirm-sheet';
import { isEpisodeLog, type LogRequest } from '@/features/log-media/log-request';
import { parseTags } from '@/features/log-media/parse-tags';
import { sequelLogRequest } from '@/features/log-media/sequel-log';
import { episodeNoticeToastCopy, logToastCopy } from '@/features/log-media/toast-copy';
import { useLogMedia } from '@/features/log-media/use-log-media';
import { useLogTargetsSplit, useTargetSelection } from '@/features/log-media/use-log-targets';
import { useLetterboxdCompletion } from '@/features/log-media/use-letterboxd-completion';
import { LetterboxdCompletionOffer } from '@/features/log-media/letterboxd-completion-offer';
import type { UpNextEpisodeEntry } from '@/features/up-next/types';
import { resolveQuickLog } from '@/features/up-next/ui/quick-log-state';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { loggedWatch } from '@/features/log-media/optimistic';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { toast } from '@/lib/toast';
import { anilistQueryKeys, fetchAniListSequel } from '@/state/queries/anilist';
import { useLogReconcileQuery } from '@/state/queries/log-reconcile';
import { upNextQueryKeys } from '@/state/queries/up-next';
import { providerSessionEpoch } from '@/state/session/tokens';
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

function distinctReasons(rows: readonly LedgerRow[]): ProviderWriteOutcome[] {
  const seen = new Map<string, ProviderWriteOutcome>();
  for (const row of rows) {
    for (const outcome of row.result?.outcomes ?? []) {
      const text =
        outcome.status === 'error'
          ? outcome.message
          : outcome.status === 'queued'
            ? undefined
            : outcome.reason;
      if (text == null) continue;
      const key = `${outcome.provider}:${outcome.status}:${text}`;
      if (!seen.has(key)) seen.set(key, outcome);
    }
  }
  return [...seen.values()];
}

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

export function CatchUpLogSheet() {
  const { session, open } = useCatchUpLog();
  if (session == null) return null;
  return <LogSessionSheet key={session.id} open={open} request={session.request} />;
}

function LogSessionSheet({ request, open }: { request: LogRequest; open: boolean }) {
  const { closeCatchUp } = useCatchUpControls();
  return (
    <Sheet onClose={closeCatchUp} open={open}>
      <LogSheetContent onClose={closeCatchUp} open={open} request={request} />
    </Sheet>
  );
}

/** Sheet-agnostic content for both the app-level drawer and inline card-actions (native drawers cannot co-present). */
export function LogSheetContent({
  request,
  open,
  onClose,
  onDismiss,
  onOpenRequest,
}: {
  request: LogRequest;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRequest?: (request: LogRequest) => void;
}) {
  if (!isEpisodeLog(request)) {
    return (
      <LogConfirmForm
        onClose={onClose}
        onDismiss={onDismiss}
        onOpenRequest={onOpenRequest}
        open={open}
        request={request}
      />
    );
  }
  return request.entry != null ? (
    <QuickCatchUpForm
      entry={request.entry}
      onClose={onClose}
      onDismiss={onDismiss}
      onOpenRequest={onOpenRequest}
      open={open}
    />
  ) : (
    <EpisodeCatchUpForm
      onClose={onClose}
      onDismiss={onDismiss}
      onOpenRequest={onOpenRequest}
      open={open}
      request={request}
    />
  );
}

function QuickCatchUpForm({
  entry,
  open,
  onClose,
  onDismiss,
  onOpenRequest,
}: {
  entry: UpNextEpisodeEntry;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRequest?: (request: LogRequest) => void;
}) {
  const evidence = useCatchUpEvidence(entry);
  const queue = evidence.status === 'ready' ? catchUpQueue(entry, evidence.evidence) : null;
  return (
    <CatchUpForm
      item={entry.item}
      first={entryEpisode(entry)}
      queue={queue}
      source={entry.source}
      open={open}
      onClose={onClose}
      onDismiss={onDismiss}
      onOpenRequest={onOpenRequest}
    />
  );
}

function EpisodeCatchUpForm({
  request,
  open,
  onClose,
  onDismiss,
  onOpenRequest,
}: {
  request: LogRequest;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRequest?: (request: LogRequest) => void;
}) {
  const queue = useEpisodeLogQueue(request);
  const first = request.episodes?.[0] ?? { number: request.entryEpisodes![0] };
  return (
    <CatchUpForm
      item={request.item}
      first={first}
      queue={queue}
      open={open}
      onClose={onClose}
      onDismiss={onDismiss}
      onOpenRequest={onOpenRequest}
    />
  );
}

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
  const [findingSequel, startSequelHandoff] = useTransition();
  const { trackBusy, trackLog, openLog } = useCatchUpControls();
  const {
    writable: targets,
    manual: manualTargets,
    unmatched: unmatchedTargets,
  } = useLogTargetsSplit(item);
  const [selectedProviders, setSelectedProviders] = useTargetSelection(targets);
  const [tags, setTags] = useState(DEFAULT_LOG_TAGS);
  const [liked, setLiked] = useState(false);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [frozen, setFrozen] = useState<CatchUpEpisode[] | null>(null);
  const [index, setIndex] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    return () => {
      openRef.current = false;
    };
  }, [open]);

  const queue = frozen ?? live;
  const current = queue?.[index] ?? first;
  const code = catchUpEpisodeCode(current);
  const remaining = queue == null ? null : queue.length - index - 1;
  const lastConfirmed =
    frozen != null && ledger.some((row) => sameEpisode(row.episode, frozen[frozen.length - 1]));
  const currentRow = ledger.find((row) => sameEpisode(row.episode, current));
  const awaiting = findingSequel || (lastConfirmed && currentRow?.status === 'pending');
  const currentLanded =
    currentRow?.status === 'done' &&
    currentRow.result != null &&
    isCleanWriteReport(currentRow.result);
  const allSettled = lastConfirmed && ledger.every((row) => row.status !== 'pending');
  const allClean =
    allSettled &&
    ledger.every(
      (row) => row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
    );

  useLogReconcileQuery(
    {
      ...episodeVariables(item, current),
      providers: selectedProviders,
    },
    open,
  );

  const ledgerRef = useRef<LedgerRow[]>([]);
  const lastFiredRef = useRef(false);
  const sequelEpochRef = useRef<number | null>(null);

  function finishIfSettled(rows: LedgerRow[]) {
    if (!lastFiredRef.current) return;
    if (!openRef.current) return;
    if (rows.some((row) => row.status === 'pending')) return;
    const clean = rows.every(
      (row) => row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
    );
    if (!clean) return;
    const followUp = completion(rows.map((row) => row.episode));
    if (followUp != null) {
      setCompletionOffer({
        ...followUp,
        watchedAt: watchedAt?.toISOString(),
        tags: parseTags(tags),
        liked,
      });
      return;
    }
    if (rows.length > 1) {
      const succeeded = new Set(rows.flatMap((row) => row.result?.succeeded ?? []));
      const queued = new Set(rows.flatMap((row) => row.result?.queued ?? []));
      if (succeeded.size === 0) {
        toast.success('Saved offline', `${rows.length} episodes log when you are back online`);
      } else if (queued.size > 0) {
        const reached = rows.filter((row) => (row.result?.succeeded.length ?? 0) > 0).length;
        const waiting = rows.filter((row) => (row.result?.queued.length ?? 0) > 0).length;
        toast.success(
          'Logged',
          `${reached} of ${rows.length} episodes reached ${labels([...succeeded])}. ${waiting} ${waiting === 1 ? 'waits' : 'wait'} for ${labels([...queued])}`,
        );
      } else {
        toast.success('Caught up', `Logged ${rows.length} episodes to ${labels([...succeeded])}`);
      }
    } else {
      const only = rows[0]?.result;
      if (only != null) {
        const copy = logToastCopy(only);
        toast.success(copy.title, copy.message);
      }
    }
    const close = onDismiss ?? onClose;
    const anilistId = item.externalIds.anilist;
    const epoch = sequelEpochRef.current;
    if (
      anilistId == null ||
      epoch == null ||
      epoch !== providerSessionEpoch(Provider.AniList) ||
      rows.some((row) => (row.result?.queued.length ?? 0) > 0)
    ) {
      close();
      return;
    }
    startSequelHandoff(async () => {
      const sequel = sequelLogRequest(await fetchAniListSequel(queryClient, anilistId));
      if (!openRef.current) return;
      if (sequel != null && epoch === providerSessionEpoch(Provider.AniList))
        (onOpenRequest ?? openLog)(sequel);
      else close();
    });
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

  function fire(episode: CatchUpEpisode, variables: LogMediaVariables, next?: CatchUpEpisode) {
    const episodeCode = capitalize(catchUpEpisodeCode(episode));
    record(episode, { status: 'pending' });
    const write = logMedia.mutateAsync(variables);
    trackLog(
      loggedWatch(variables, next),
      write.then((result) => result.settled),
    );

    // Await the Up Next refetch so busy clears only after the updated data lands (docs/solutions/quick-log-settle-refresh-to-update.md).
    trackBusy(
      item.id,
      write.then((result) =>
        source == null || resolveQuickLog(result, source).phase === 'settling'
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
        if (clean) {
          const copy = logToastCopy(result);
          toast.success(`${copy.title} ${episodeCode.toLowerCase()}`, copy.message);
        } else {
          const copy = episodeNoticeToastCopy(episodeCode, result);
          toast[copy.tone](copy.title, copy.message);
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
    if (index >= plan.length - 1) {
      lastFiredRef.current = true;
      const anilistId = item.externalIds.anilist;
      if (episode.season == null && anilistId != null) {
        const cached = queryClient.getQueryData<NormalizedMediaItem>(
          anilistQueryKeys.anime(anilistId),
        );
        const total = cached?.totalEpisodes ?? item.totalEpisodes;
        if (episode.number === total)
          sequelEpochRef.current = providerSessionEpoch(Provider.AniList);
      }
    }
    fire(episode, variablesFor(episode), plan[index + 1]);

    if (index >= plan.length - 1) return;
    setIndex(index + 1);
  }

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
  const clean = ledger.filter(
    (row) => row.status === 'done' && row.result != null && isCleanWriteReport(row.result),
  );
  const landed = clean.filter((row) => (row.result?.succeeded.length ?? 0) > 0).length;
  const saved = clean.length - landed;
  const sending = ledger.filter((row) => row.status === 'pending').length;
  const simklQueued =
    selectedProviders.includes(Provider.Simkl) && ledger.length > 1 && sending > 0;

  const [reported, setReported] = useState(false);
  if (allSettled && !allClean && !reported) setReported(true);

  return (
    <WriteSheet.Step key={completionOffer != null ? 'completion' : reported ? 'report' : 'form'}>
      {completionOffer != null ? (
        <LetterboxdCompletionOffer
          request={completionOffer}
          onClose={onClose}
          onOpenRequest={onOpenRequest}
        />
      ) : reported ? (
        <ChainReport
          findingSequel={findingSequel}
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
              <Text className="text-muted font-sans text-sm leading-relaxed">“{item.title}”</Text>
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
            unmatchedTargets={unmatchedTargets}
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

          {(!currentLanded || findingSequel) && (
            <WriteSheet.Actions>
              <Button
                variant="log"
                disabled={selectedProviders.length === 0 || queue == null}
                icon={<Button.Icon name="eye" />}
                label={chainLabel(code, { landed, failed: problems.length, saved })}
                loading={awaiting || queue == null}
                loadingLabel={findingSequel ? 'Finding next episode…' : 'Logging…'}
                morphLabel
                onPress={confirm}
              />
            </WriteSheet.Actions>
          )}

          {simklQueued && (
            <Text className="text-muted font-sans text-xs text-center mt-3">
              Simkl takes one write every 20 seconds, so the rest wait their turn — keep going.
            </Text>
          )}
        </>
      )}
    </WriteSheet.Step>
  );
}

function ChainReport({
  findingSequel,
  item,
  landed,
  ledger,
  onDone,
  onRetry,
  problems,
  selectedProviders,
  sending,
}: {
  findingSequel: boolean;
  item: NormalizedMediaItem;
  landed: number;
  ledger: readonly LedgerRow[];
  onDone: () => void;
  onRetry: () => void;
  problems: readonly LedgerRow[];
  selectedProviders: readonly ProviderId[];
  sending: number;
}) {
  const failedProviders = [...new Set(problems.flatMap((row) => row.result?.failed ?? []))];
  const succeededProviders = [...new Set(ledger.flatMap((row) => row.result?.succeeded ?? []))];
  const thrown = [
    ...new Set(
      ledger.flatMap((row) => (row.status === 'error' ? [row.message ?? 'Could not log.'] : [])),
    ),
  ];
  const retryable = ledger.filter((row) => retryProviders(row, selectedProviders) != null);
  const pendingLabel = findingSequel ? 'Finding next episode…' : sending > 0 ? 'Retrying…' : null;

  return (
    <>
      <WriteSheet.Header done onClose={onDone}>
        <WriteSheet.Title>
          {problems.length > 0
            ? chainFailure(
                problems.map((row) => catchUpEpisodeCode(row.episode)),
                failedProviders,
              )
            : sending > 0
              ? 'Retrying…'
              : 'Logged'}
        </WriteSheet.Title>
      </WriteSheet.Header>
      {landed > 0 && succeededProviders.length > 0 && (
        <WriteSheet.Description>
          {`${landed} ${landed === 1 ? 'episode' : 'episodes'} reached ${labels(succeededProviders)}.`}
        </WriteSheet.Description>
      )}

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

      {(retryable.length > 0 || pendingLabel != null) && (
        <WriteSheet.Actions>
          <Button
            variant="log"
            icon={<Button.Icon name="refresh" />}
            label={
              pendingLabel ??
              (retryable.length === 1
                ? capitalize(`retry ${catchUpEpisodeCode(retryable[0]!.episode)}`)
                : `Retry ${retryable.length} episodes`)
            }
            loading={pendingLabel != null}
            loadingLabel={pendingLabel ?? undefined}
            onPress={onRetry}
          />
        </WriteSheet.Actions>
      )}
    </>
  );
}
