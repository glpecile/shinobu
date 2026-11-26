import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useController, useForm, useWatch, type Control, type UseFormGetValues } from 'react-hook-form';
import type { TextInputInstance } from 'react-native';
import { Text, View } from 'react-native';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { Button } from '@/components/button';
import { LikeButton } from '@/components/like-button';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useLetterboxdUserscript, useLetterboxdUserscriptUntrusted } from '@/lib/providers/letterboxd/userscript-bridge';
import { letterboxdScriptHint } from '@/lib/install-letterboxd-script';
import { usePushRoute } from '@/lib/navigation';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { useCatchUpControls } from '@/features/log-media/session/state';
import { isReadIntent } from '@/features/watchlist-media/copy';
import { ProviderPicker } from '@/features/write-sheet/provider-picker';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { PROVIDERS } from '@/lib/providers/registry';
import { unmatchedWriteReason } from '@/lib/providers/routing';
import { Provider, type ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import { useReadingInPages } from '@/state/prefs/reading-unit';
import { anilistQueryKeys } from '@/state/queries/anilist';
import { hardcoverQueryKeys } from '@/state/queries/hardcover';
import { useLogReconcileQuery } from '@/state/queries/log-reconcile';
import type { NormalizedMediaItem } from '@/types/media';
import { TagPicker } from './tag-picker';
import type { LogRequest } from './log-request';
import { parseTags } from './parse-tags';
import { ReadingProgressField, readingSpan, readingTitle } from './reading-progress-field';
import { StepperField } from './stepper-field';
import { logToastCopy } from './toast-copy';
import { loggedWatch } from './optimistic';
import { useLogMedia } from './use-log-media';
import { useLogTargetsSplit, useTargetSelection } from './use-log-targets';
import { WatchedAtField } from './watched-at-field';
import { useLetterboxdCompletion } from './use-letterboxd-completion';
import { LetterboxdCompletionOffer } from './letterboxd-completion-offer';
import {
  chaptersThrough,
  stepThroughChapter,
  throughChapterSchema,
  throughChapterText,
  type ThroughChapterForm,
} from './through-chapter-schema';

export const DEFAULT_LOG_TAGS = 'shinobu, ';

const DIARY_PROVIDERS = [
  Provider.Letterboxd,
  Provider.Serializd,
] as const satisfies readonly ProviderId[];

const UNDATED_PROVIDERS: readonly ProviderId[] = [Provider.AniList];

export function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

export interface LogFormFieldsProps {
  pending: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  item: NormalizedMediaItem;
  targets: readonly ProviderId[];
  manualTargets?: readonly ProviderId[];
  unmatchedTargets?: readonly ProviderId[];
  selectedProviders: ProviderId[];
  onSelectedProvidersChange: (ids: ProviderId[]) => void;
  watchedAt: Date | null;
  onWatchedAtChange: (value: Date | null) => void;
  liked: boolean;
  onLikedChange: (value: boolean) => void;
  tags?: string;
  onTagsChange?: (value: string) => void;
}

export function LogFormFields({
  item,
  onClose,
  onDismiss,
  targets,
  manualTargets = [],
  unmatchedTargets = [],
  selectedProviders,
  onSelectedProvidersChange,
  watchedAt,
  onWatchedAtChange,
  liked,
  onLikedChange,
  tags,
  onTagsChange,
  pending,
}: LogFormFieldsProps) {
  const tagsInput = useRef<TextInputInstance>(null);
  const pushRoute = usePushRoute();
  const userscriptLikes = useLetterboxdUserscript('like');
  const scriptUntrusted = useLetterboxdUserscriptUntrusted();
  const diaryProviders = DIARY_PROVIDERS.filter((id) =>
    selectedProviders.includes(id),
  );
  const showTagsField = onTagsChange != null && diaryProviders.length > 0;
  const showDateField = selectedProviders.some((id) => !UNDATED_PROVIDERS.includes(id));
  const needsScriptUpdate = process.env.EXPO_OS === 'web' &&
    diaryProviders.includes(Provider.Letterboxd) && !userscriptLikes;

  function toggleProvider(id: ProviderId) {
    onSelectedProvidersChange(
      selectedProviders.includes(id)
        ? selectedProviders.filter((provider) => provider !== id)
        : [...selectedProviders, id],
    );
  }

  function selectAllProviders() {
    onSelectedProvidersChange([...targets]);
  }

  function selectNoProviders() {
    onSelectedProvidersChange([]);
  }

  return (
    <>
      <View
        className={cn(pending && 'opacity-50')}
        style={{ pointerEvents: pending ? 'none' : 'auto' }}
      >
        <Text className="text-foreground font-sans-semibold text-sm mt-5 mb-2">
          Write to
        </Text>
        <ProviderPicker
          onConnect={() => {
            (onDismiss ?? onClose)();
            pushRoute(routes.settings);
          }}
          onSelectAll={selectAllProviders}
          onSelectNone={selectNoProviders}
          onToggle={toggleProvider}
          selectedProviders={selectedProviders}
          targets={targets}
        />
        <ManualWriteRows
          item={item}
          manual={[...manualTargets, ...unmatchedTargets]}
          reasons={{
            ...(process.env.EXPO_OS === 'web' ? { [Provider.Letterboxd]: letterboxdScriptHint(scriptUntrusted, 'log here') } : {}),
            ...Object.fromEntries(unmatchedTargets.map((id) => [id, unmatchedWriteReason(item)])),
          }}
        />
        {showDateField && (
          <WatchedAtField
            label={isReadIntent(item) ? 'Read on' : 'Watched on'}
            onChange={onWatchedAtChange}
            value={watchedAt}
          >
            {diaryProviders.length > 0 && (
              <LikeButton
                disabled={pending || needsScriptUpdate}
                label={`Like on ${labels(diaryProviders)}`}
                liked={liked}
                onChange={onLikedChange}
              />
            )}
          </WatchedAtField>
        )}
        {needsScriptUpdate && (
          <Text className="text-muted font-sans text-xs mt-2">
            Update the Letterboxd userscript in Advanced setup to enable likes.
          </Text>
        )}
        {showTagsField && (
          <View className="mt-4">
            <Text
              className="text-foreground font-sans-semibold text-sm mb-2"
              onPress={() => tagsInput.current?.focus()}
            >
              Tags{' '}
              <Text className="text-muted font-sans text-xs">
                ({labels(diaryProviders)})
              </Text>
            </Text>
            <TextField
              ref={tagsInput}
              accessibilityLabel={`Tags (${labels(diaryProviders)})`}
              editable={!pending}
              onChangeText={onTagsChange}
              placeholder="tags, comma separated"
              returnKeyType="done"
              value={tags ?? ''}
            />
            <TagPicker onChange={onTagsChange} value={tags ?? ''} />
          </View>
        )}
      </View>
    </>
  );
}

function ThroughChapterField({ control, getValues, from, total, pending }: {
  control: Control<ThroughChapterForm>;
  getValues: UseFormGetValues<ThroughChapterForm>;
  from: number;
  total?: number;
  pending: boolean;
}) {
  const { field, fieldState } = useController({ control, name: 'through' });

  return (
    <StepperField
      backLabel="Previous chapter"
      canStepBack={Number(field.value) > from}
      canStepForward={stepThroughChapter(field.value, 1, from, total) !== field.value}
      className="mt-5"
      error={fieldState.error?.message}
      forwardLabel="Next chapter"
      label="Through chapter"
      note={total == null ? `Chapter ${from} or later.` : `Chapter ${from} to ${total}.`}
      onBlur={field.onBlur}
      onChangeText={(text) => field.onChange(throughChapterText(text, from, total))}
      onStep={(by) => field.onChange(stepThroughChapter(getValues('through'), by, from, total))}
      pending={pending}
      value={field.value}
    />
  );
}

export function LogConfirmForm({ request, open, onClose, onDismiss, onOpenRequest }: {
  request: LogRequest;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRequest?: (request: LogRequest) => void;
}) {
  const { item, description } = request;
  const { fontScale } = useWindowDimensions();
  const repeat = isReadIntent(item) ? 'reread' : 'rewatch';
  const range = request.chapterRange;
  const { control, getValues, handleSubmit, formState: { errors } } = useForm<ThroughChapterForm>({
    defaultValues: { through: range == null ? '' : String(range.from) },
    mode: 'onChange',
    delayError: 500,
    resolver: zodResolver(throughChapterSchema(range?.from ?? 1)),
  });
  const through = Number(useWatch({ control, name: 'through' }));
  const [reading, setReading] = useState(request.reading);
  const inPages = useReadingInPages();
  const span =
    range != null && through > range.from
      ? `chapters ${range.from}–${through}`
      : reading != null
        ? readingSpan(reading, inPages)
        : undefined;
  const title =
    reading != null ? readingTitle(reading, inPages) : span == null ? request.title : `Log ${span}`;
  const { trackBusy, trackLog } = useCatchUpControls();
  const queryClient = useQueryClient();
  const logMedia = useLogMedia();
  const { writable: targets, manual: manualTargets, unmatched: unmatchedTargets } = useLogTargetsSplit(item);
  const completion = useLetterboxdCompletion(item);
  const [completionOffer, setCompletionOffer] = useState<LogRequest | null>(null);
  const [selectedProviders, setSelectedProviders] = useTargetSelection(targets);
  const [watchedAt, setWatchedAt] = useState<Date | null>(() => request.watchedAt == null ? null : new Date(request.watchedAt));
  const [tags, setTags] = useState(request.tags?.join(', ') ?? DEFAULT_LOG_TAGS);
  const [liked, setLiked] = useState(request.liked ?? false);
  const [retryOf, setRetryOf] = useState<{ rewatch: boolean; unanswered: ProviderId[] } | null>(null);
  useLogReconcileQuery({
    item,
    episodes: request.episodes,
    entryEpisodes: request.entryEpisodes,
    providers: selectedProviders,
  }, open);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    return () => { openRef.current = false; };
  }, [open]);

  function confirm() {
    if (logMedia.isPending || selectedProviders.length === 0) return;
    if (range == null) {
      send(request.entryEpisodes);
      return;
    }
    void handleSubmit(({ through: last }) => send(chaptersThrough(range.from, Number(last))))();
  }

  function send(entryEpisodes: number[] | undefined) {
    haptics.confirm();
    const parsedTags = parseTags(tags);
    const write = logMedia.mutateAsync({
      item,
      episodes: request.episodes,
      entryEpisodes,
      providers: selectedProviders,
      liked,
      ...(reading != null
        ? { reading: reading.finished ? { finished: true } : { finished: false, page: reading.page } }
        : {}),
      ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
      ...(retryOf != null ? { retryOf } : {}),
    });
    trackLog(
      loggedWatch({ item, episodes: request.episodes, entryEpisodes }),
      write.then((result) => result.settled),
    );
    const bookId = item.externalIds.hardcover;
    const settleKeys =
      reading != null && bookId != null
        ? [hardcoverQueryKeys.bookEntry(bookId), hardcoverQueryKeys.reading()]
        : item.type === 'MANGA'
          ? [anilistQueryKeys.reading()]
          : [];
    trackBusy(
      item.id,
      settleKeys.length === 0
        ? write
        : write.then(() =>
            Promise.all(settleKeys.map((queryKey) =>
              queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false }),
            )),
          ),
    );
    void write.then(
      (outcome) => {
        if (!openRef.current) {
          if (isCleanWriteReport(outcome)) {
            const copy = logToastCopy(outcome, repeat, span);
            toast.success(copy.title, copy.message);
          } else {
            toast.error(
              `Not logged on ${labels([...outcome.failed, ...outcome.skipped])}`,
              outcome.succeeded.length > 0 ? `${labels(outcome.succeeded)} was logged.` : undefined,
            );
          }
          return;
        }
        if (isCleanWriteReport(outcome)) {
          const followUp = request.episodes?.length ? completion(request.episodes) : null;
          if (followUp != null) {
            setCompletionOffer({ ...followUp, watchedAt: watchedAt?.toISOString(), tags: parsedTags, liked });
            return;
          }
          const copy = logToastCopy(outcome, repeat, span);
          toast.success(copy.title, copy.message);
          (onDismiss ?? onClose)();
        } else if (outcome.failed.length > 0) haptics.error();
      },
      (error: unknown) => {
        if (openRef.current) haptics.error();
        else toast.error('Could not log', error instanceof Error ? error.message : undefined);
      },
    );
  }
  const result = logMedia.data;
  const pending = logMedia.isPending;
  const reported =
    logMedia.isError || (result != null && !isCleanWriteReport(result));
  const retryable = logMedia.isError || (result?.failed.length ?? 0) > 0;

  function retry() {
    if (result != null && result.failed.length > 0) {
      setSelectedProviders([...result.failed]);
      setRetryOf({
        rewatch: result.rewatch,
        unanswered: [
          ...(result.unanswered ?? []),
          ...result.outcomes.flatMap((outcome) =>
            outcome.status === 'error' && outcome.transient === 'network' ? [outcome.provider] : [],
          ),
        ],
      });
    }
    logMedia.reset();
  }

  if (completionOffer != null) return (
    <WriteSheet.Step key="completion">
      <LetterboxdCompletionOffer request={completionOffer} onClose={onClose} onOpenRequest={onOpenRequest} />
    </WriteSheet.Step>
  );

  return (
    <WriteSheet.Step key={reported ? 'report' : 'form'}>
      <WriteSheet.Header done={reported} onClose={onClose}>
        <WriteSheet.Title>{title}</WriteSheet.Title>
      </WriteSheet.Header>
      {reported ? (
        <>
          <WriteSheet.Report
            item={item}
            reconcileLine={(skipped) =>
              `${labels(skipped)} already had this logged — skipped to keep both in sync.`
            }
            result={result}
            succeededLine={(succeeded) =>
              `${result?.rewatch ? `Logged ${repeat} to` : 'Logged to'} ${labels(succeeded)}.`
            }
          />
          {logMedia.isError && (
            <WriteSheet.Error>Could not log. Try again.</WriteSheet.Error>
          )}
          {retryable && (
            <WriteSheet.Actions>
              <Button
                variant="log"
                icon={<Button.Icon name="refresh" />}
                label="Try again"
                onPress={retry}
              />
            </WriteSheet.Actions>
          )}
        </>
      ) : (
        <>
          <WriteSheet.Description>{description}</WriteSheet.Description>
          {range != null && (
            <ThroughChapterField
              control={control}
              from={range.from}
              getValues={getValues}
              pending={pending}
              total={range.total}
            />
          )}
          {reading != null && (
            <ReadingProgressField
              onChange={(update) => setReading((current) => current && update(current))}
              pending={pending}
              value={reading}
            />
          )}
          <LogFormFields
            item={item}
            manualTargets={manualTargets}
            unmatchedTargets={unmatchedTargets}
            onClose={onClose}
            onDismiss={onDismiss}
            onSelectedProvidersChange={setSelectedProviders}
            onWatchedAtChange={setWatchedAt}
            liked={liked}
            onLikedChange={setLiked}
            pending={pending}
            selectedProviders={selectedProviders}
            targets={targets}
            watchedAt={watchedAt}
            tags={tags}
            onTagsChange={setTags}
          />
          <WriteSheet.Actions>
            <Button
              variant="log"
              disabled={selectedProviders.length === 0 || errors.through != null}
              icon={<Button.Icon name="eye" />}
              label={title}
              loading={pending}
              loadingLabel="Logging…"
              morphLabel={(range != null || (reading != null && reading.total == null)) && fontScale <= 1}
              onPress={confirm}
            />
          </WriteSheet.Actions>
        </>
      )}
    </WriteSheet.Step>
  );
}
