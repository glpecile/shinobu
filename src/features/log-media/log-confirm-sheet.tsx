import { Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { ManualWriteRows } from '@/features/write-sheet/manual-write-rows';
import { ProviderPicker } from '@/features/write-sheet/provider-picker';
import { WriteResultReport } from '@/features/write-sheet/write-result-report';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import { TagPicker } from './tag-picker';
import { useLogMedia } from './use-log-media';
import { WatchedAtField } from './watched-at-field';

/**
 * The providers whose diary payload actually carries tags — Letterboxd's diary
 * entry (plan 0012) and Serializd's `show/reviews/add` body (plan 0017). Both
 * gate the field *and* name it, so the label can never drift from the gate the
 * way a hardcoded "(Letterboxd)" did on a TV log.
 */
const TAG_PROVIDERS = [
  'letterboxd',
  'serializd',
] as const satisfies readonly ProviderId[];

/** Joins provider labels for "Writes to ..." and outcome copy in both sheets. */
export function labels(ids: readonly ProviderId[]): string {
  return ids.map((id) => PROVIDERS[id].label).join(', ');
}

/** "Log watch on Trakt, AniList" — no dangling "on" while nothing is selected. */
export function confirmLabelFor(
  action: string,
  ids: readonly ProviderId[],
): string {
  return ids.length === 0 ? action : `${action} on ${labels(ids)}`;
}

/**
 * The shared confirm/backdate sheet behind every log action (plan 0010
 * extracts this from the movie `LogMediaButton`). It shows the write targets,
 * a backdate field, per-provider partial failure (kept in context rather than
 * flashed after close), and the confirm/cancel pair. The parent owns the
 * `useLogMedia` mutation (so the season picker and the sheet share one), the
 * `watchedAt` state, and the confirm handler that fills `LogMediaVariables`.
 *
 * The picker, the manual rows and the result families are the shared
 * `features/write-sheet` components (plan 0032 U2, KTD-1) — this sheet keeps
 * only its verb-specific fields: `WatchedAtField` and the tags input.
 */
export interface LogConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
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
  /** The single shared `useLogMedia` mutation — sheet reads state, parent fires it. */
  logMedia: ReturnType<typeof useLogMedia>;
  watchedAt: Date | null;
  onWatchedAtChange: (value: Date | null) => void;
  /**
   * Raw comma-separated diary tags — accepted by Letterboxd's and Serializd's
   * diary payloads (plan 0012/0017), so the field renders only when the parent
   * provides this pair *and* one of those is among the selected targets.
   */
  tags?: string;
  onTagsChange?: (value: string) => void;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => void;
}

export function LogConfirmSheet({
  open,
  onClose,
  title,
  description,
  item,
  targets,
  manualTargets = [],
  selectedProviders,
  onSelectedProvidersChange,
  logMedia,
  watchedAt,
  onWatchedAtChange,
  tags,
  onTagsChange,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: LogConfirmSheetProps) {
  const result = logMedia.data;
  const muted = useCSSVariable('--color-muted');
  // Same gate as before — every provider in TAG_PROVIDERS genuinely consumes
  // tags, so narrowing this would silently drop working Serializd functionality.
  const tagProviders = TAG_PROVIDERS.filter((id) =>
    selectedProviders.includes(id),
  );
  const showTagsField = onTagsChange != null && tagProviders.length > 0;

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
    <Sheet onClose={onClose} open={open}>
      <Text className="text-2xl font-display text-foreground">{title}</Text>
      <Text className="text-muted font-sans text-sm mt-2 leading-relaxed">
        {description}
      </Text>

      <Text className="text-foreground font-sans-semibold text-sm mt-5 mb-2">
        Write to
      </Text>
      <ProviderPicker
        onSelectAll={selectAllProviders}
        onSelectNone={selectNoProviders}
        onToggle={toggleProvider}
        selectedProviders={selectedProviders}
        targets={targets}
      />
      <ManualWriteRows item={item} manual={manualTargets} />
      {selectedProviders.length === 0 && (
        <Text className="text-accent font-sans text-sm mt-2">
          Select at least one provider to log.
        </Text>
      )}

      <WatchedAtField onChange={onWatchedAtChange} value={watchedAt} />
      {showTagsField && (
        <View className="mt-4">
          <Text className="text-foreground font-sans-semibold text-sm mb-2">
            Tags{' '}
            <Text className="text-muted font-sans text-xs">
              ({labels(tagProviders)})
            </Text>
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
            onChangeText={onTagsChange}
            placeholder="tags, comma separated"
            placeholderTextColor={typeof muted === 'string' ? muted : undefined}
            value={tags ?? ''}
          />
          <TagPicker onChange={onTagsChange} value={tags ?? ''} />
        </View>
      )}
      {/* Visible only on a report that kept the sheet open (a clean one closed
          it and became the toast): the success half of a partial outcome. */}
      {result != null && result.succeeded.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {result.rewatch ? 'Logged rewatch to' : 'Logged to'}{' '}
          {labels(result.succeeded)}.
        </Text>
      )}
      {result != null && (
        <WriteResultReport
          failedHeadline={(failed, succeeded) =>
            `Failed on ${labels(failed)}${
              succeeded.length > 0 ? ` — ${labels(succeeded)} was logged.` : '.'
            }`
          }
          item={item}
          outcomes={result.outcomes}
          reconcileLine={(skipped) =>
            `${labels(skipped)} already had this logged — skipped to keep both in sync.`
          }
        />
      )}
      {logMedia.isError && (
        <Text className="text-accent font-sans text-sm mt-3">
          Could not log. Try again.
        </Text>
      )}
      {/* The fan-out can take seconds across four providers — a text swap to
          "Logging…" alone read as a stuck button. */}
      <Button
        className="mt-6"
        disabled={selectedProviders.length === 0}
        label={confirmLabel}
        loading={logMedia.isPending}
        loadingLabel={pendingLabel}
        onPress={onConfirm}
      />
      <Button
        className="mt-2"
        label="Cancel"
        onPress={onClose}
        variant="quiet"
      />
    </Sheet>
  );
}
