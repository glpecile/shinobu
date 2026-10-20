import { useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { LikeButton } from '@/components/like-button';
import { TextField } from '@/components/text-field';
import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { usePushRoute } from '@/lib/navigation';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { useCatchUpControls } from '@/features/log-media/session/state';
import { ProviderPicker } from '@/features/write-sheet/provider-picker';
import { isCleanWriteReport } from '@/features/write-sheet/is-clean-report';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import type { NormalizedMediaItem } from '@/types/media';
import { TagPicker } from './tag-picker';
import type { LogRequest } from './log-request';
import { parseTags } from './parse-tags';
import { logToastCopy } from './toast-copy';
import { useLogMedia } from './use-log-media';
import { useLogTargetsSplit } from './use-log-targets';
import { WatchedAtField } from './watched-at-field';
import { useLetterboxdCompletion } from './use-letterboxd-completion';
import { LetterboxdCompletionOffer } from './letterboxd-completion-offer';

/** Editable diary tag shared by one-shot and chained logging sessions. */
export const DEFAULT_LOG_TAGS = 'shinobu, ';

/**
 * The providers whose diary payload carries tags and likes — Letterboxd's diary
 * entry (plan 0012) and Serializd's `show/reviews/add` body (plan 0017). Both
 * gate the field *and* name it, so the label can never drift from the gate the
 * way a hardcoded "(Letterboxd)" did on a TV log.
 */
const DIARY_PROVIDERS = [
  'letterboxd',
  'serializd',
] as const satisfies readonly ProviderId[];

/** Joins provider labels for "Writes to ..." and outcome copy in both sheets. */
export function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

export interface LogFormFieldsProps {
  pending: boolean;
  onClose: () => void;
  /** Dismiss the host before navigating away, rather than returning to its rows. */
  onDismiss?: () => void;
  /** The item being logged — needed to build manual/outcome provider links (plan 0022). */
  item: NormalizedMediaItem;
  targets: readonly ProviderId[];
  /**
   * Targets whose write is unsupported on this platform (e.g. Letterboxd on
   * web, plan 0022 R1–R4) — shown as a non-toggleable "log manually" row,
   * never part of `targets`/`selectedProviders`.
   */
  manualTargets?: readonly ProviderId[];
  /** Which of `targets` are actually selected — defaults to all targets. */
  selectedProviders: ProviderId[];
  onSelectedProvidersChange: (ids: ProviderId[]) => void;
  watchedAt: Date | null;
  onWatchedAtChange: (value: Date | null) => void;
  liked: boolean;
  onLikedChange: (value: boolean) => void;
  /**
   * Raw comma-separated diary tags — accepted by Letterboxd's and Serializd's
   * diary payloads (plan 0012/0017), so the field renders only when the parent
   * provides this pair *and* one of those is among the selected targets.
   */
  tags?: string;
  onTagsChange?: (value: string) => void;
}

/**
 * The log verb's fields — write targets, manual rows, the backdate field and
 * the tags input — without the sheet, header, result or buttons around them.
 * `LogConfirmForm` composes it for movies and season batches; the episode catch-up
 * chain (plan 0037, `features/log-media/session`) composes it under its own
 * header and above its own ledger, keeping one form for both.
 */
export function LogFormFields({
  item,
  onClose,
  onDismiss,
  targets,
  manualTargets = [],
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
  const tagsInput = useRef<TextInput>(null);
  const pushRoute = usePushRoute();
  const userscriptLikes = useLetterboxdUserscript('like');
  const diaryProviders = DIARY_PROVIDERS.filter((id) =>
    selectedProviders.includes(id),
  );
  const showTagsField = onTagsChange != null && diaryProviders.length > 0;
  const needsScriptUpdate = process.env.EXPO_OS === 'web' &&
    diaryProviders.includes('letterboxd') && !userscriptLikes;

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
      {/* Frozen while the fan-out runs: a tag or target toggled mid-write would
          land on some providers and not others, and the picker's taps stayed
          live even though the confirm button was already spinning. */}
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
        <ManualWriteRows item={item} manual={manualTargets} />
        <WatchedAtField onChange={onWatchedAtChange} value={watchedAt}>
          {diaryProviders.length > 0 && (
            <LikeButton
              disabled={pending || needsScriptUpdate}
              label={`Like on ${labels(diaryProviders)}`}
              liked={liked}
              onChange={onLikedChange}
            />
          )}
        </WatchedAtField>
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
              value={tags ?? ''}
            />
            <TagPicker onChange={onTagsChange} value={tags ?? ''} />
          </View>
        )}
      </View>
    </>
  );
}

/**
 * One-shot movie/season-batch session: owns the form, confirmation, and
 * partial-failure report. Sheet-agnostic — the app-level `CatchUpLogSheet`
 * wraps it in its own drawer, and the card-actions sheet renders it in place
 * of its rows (the watchlist picker's plan 0032 U3 shape): a second native
 * drawer can't co-present over the first, so the form swaps in instead.
 */
export function LogConfirmForm({ request, open, onClose, onDismiss, onOpenRequest }: {
  request: LogRequest;
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** Renders a Letterboxd series-completion follow-up inline, like `onClose`'s host does. */
  onOpenRequest?: (request: LogRequest) => void;
}) {
  const { item, title, description } = request;
  const { trackBusy } = useCatchUpControls();
  const logMedia = useLogMedia();
  const { writable: targets, manual: manualTargets } = useLogTargetsSplit(item);
  const completion = useLetterboxdCompletion(item);
  const [completionOffer, setCompletionOffer] = useState<LogRequest | null>(null);
  const [selectedProviders, setSelectedProviders] = useState(targets);
  const [watchedAt, setWatchedAt] = useState<Date | null>(() => request.watchedAt == null ? null : new Date(request.watchedAt));
  const [tags, setTags] = useState(request.tags?.join(', ') ?? DEFAULT_LOG_TAGS);
  const [liked, setLiked] = useState(request.liked ?? false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    return () => { openRef.current = false; };
  }, [open]);

  function confirm() {
    if (logMedia.isPending || selectedProviders.length === 0) return;
    haptics.confirm();
    const parsedTags = parseTags(tags);
    const write = logMedia.mutateAsync({
      item,
      episodes: request.episodes,
      entryEpisodes: request.entryEpisodes,
      providers: selectedProviders,
      liked,
      ...(watchedAt != null ? { watchedAt: watchedAt.toISOString() } : {}),
      ...(parsedTags.length > 0 ? { tags: parsedTags } : {}),
    });
    trackBusy(item.id, write);
    void write.then(
      (outcome) => {
        // A retired inline session must not close a newer host flow.
        if (!openRef.current) {
          if (isCleanWriteReport(outcome)) {
            const copy = logToastCopy(outcome);
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
          const copy = logToastCopy(outcome);
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
  // A clean report closes the sheet into a toast, so anything else settled is
  // the drawer's next step rather than a line under a form that can outgrow
  // the screen (a long tag list pushed Simkl's skip out of sight).
  const reported =
    logMedia.isError || (result != null && !isCleanWriteReport(result));
  const retryable = logMedia.isError || (result?.failed.length ?? 0) > 0;

  // Back to the form with only what failed selected: re-sending a provider
  // that already landed would log the watch twice.
  function retry() {
    if (result != null && result.failed.length > 0) {
      setSelectedProviders([...result.failed]);
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
              `${result?.rewatch ? 'Logged rewatch to' : 'Logged to'} ${labels(succeeded)}.`
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
          <LogFormFields
            item={item}
            manualTargets={manualTargets}
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
              disabled={selectedProviders.length === 0}
              icon={<Button.Icon name="eye" />}
              label={title}
              loading={pending}
              loadingLabel="Logging…"
              onPress={confirm}
            />
          </WriteSheet.Actions>
        </>
      )}
    </WriteSheet.Step>
  );
}
