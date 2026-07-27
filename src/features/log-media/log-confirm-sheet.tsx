import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/cn';
import { openExternalUrl } from '@/lib/open-external-url';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { NormalizedMediaItem } from '@/types/media';
import {
  manualLinkForOutcome,
  manualRowsFor,
  splitSkippedOutcomes,
} from './manual-log-links';
import type { ProviderLogOutcome } from './fan-out';
import { OutcomeLink } from './outcome-link';
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

interface ProviderToggleProps {
  id: ProviderId;
  selected: boolean;
  onToggle: () => void;
}

function ProviderToggle({ id, selected, onToggle }: ProviderToggleProps) {
  const accent = useCSSVariable('--color-accent');
  const muted = useCSSVariable('--color-muted');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const descriptor = PROVIDERS[id];

  return (
    <PresstableOpacity
      accessibilityLabel={`Log to ${descriptor.label}`}
      // No accessibilityRole="checkbox" here: RNGH's web NativeViewGestureHandler
      // only fires presses on elements whose DOM role is "button", so any other
      // role on a pressto pressable silently kills onPress on web
      // (docs/solutions/web-pressto-accessibility-role-kills-onpress.md).
      accessibilityState={{ checked: selected }}
      className={cn(
        'flex-row items-center justify-between px-3 py-2.5 rounded-md',
        selected ? 'bg-accent/10' : 'bg-surface',
      )}
      onPress={onToggle}
    >
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={18} />
        <Text className="text-foreground font-sans-semibold text-sm">
          {descriptor.label}
        </Text>
      </View>
      <Ionicons
        color={selected ? accentColor : mutedColor}
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
      />
    </PresstableOpacity>
  );
}

function ProviderPicker({
  targets,
  selectedProviders,
  onSelectAll,
  onSelectNone,
  onToggle,
}: {
  targets: readonly ProviderId[];
  selectedProviders: readonly ProviderId[];
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggle: (id: ProviderId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const selected = targets.filter((id) => selectedProviders.includes(id));
  const selectionLabel =
    selected.length === 0
      ? 'Choose providers'
      : selected.map((id) => PROVIDERS[id].label).join(', ');

  return (
    <View>
      <PresstableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className={cn(
          'flex-row items-center justify-between rounded-lg border px-4 py-3',
          expanded ? 'border-accent bg-accent/5' : 'border-border bg-surface',
        )}
        onPress={() => setExpanded(!expanded)}
      >
        <View className="flex-row items-center gap-2 flex-1 mr-3">
          {selected.length > 0 && (
            <View className="flex-row items-center gap-1">
              {selected.map((id) => (
                <ProviderIcon id={id} key={id} size={16} />
              ))}
            </View>
          )}
          <Text
            className="text-foreground font-sans-semibold text-sm flex-1"
            numberOfLines={1}
          >
            {selectionLabel}
          </Text>
        </View>
        <Ionicons
          color={mutedColor}
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
        />
      </PresstableOpacity>
      {expanded && (
        <View className="mt-2 rounded-lg border border-border bg-background p-1">
          {targets.length > 1 && (
            <View className="flex-row justify-end gap-3 px-3 py-2 border-b border-border">
              <PresstableOpacity onPress={onSelectAll}>
                <Text className="text-accent font-sans-semibold text-xs">All</Text>
              </PresstableOpacity>
              <PresstableOpacity
                accessibilityLabel="Select no providers"
                onPress={onSelectNone}
              >
                <Text className="text-muted font-sans-semibold text-xs">None</Text>
              </PresstableOpacity>
            </View>
          )}
          {targets.map((id) => (
            <ProviderToggle
              id={id}
              key={id}
              onToggle={() => onToggle(id)}
              selected={selectedProviders.includes(id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The upfront "log manually" rows (plan 0022 R3/R4) — informational, not a
 * toggle: muted styling (not accent) so it reads as distinct from the
 * writable providers above it, and it never affects `canConfirm` or
 * `confirmLabelFor` (those only ever see `targets`/`selectedProviders`,
 * which exclude manual-only providers entirely).
 */
function ManualLogRows({
  manual,
  item,
}: {
  manual: readonly ProviderId[];
  item: NormalizedMediaItem;
}) {
  const muted = useCSSVariable('--color-muted');
  const mutedColor = typeof muted === 'string' ? muted : undefined;
  const rows = manualRowsFor(manual, item);

  if (rows.length === 0) return null;

  return (
    <View className="mt-2 rounded-lg border border-border bg-background p-1">
      {rows.map(({ provider, url }) => (
        <PresstableOpacity
          accessibilityLabel={`Log manually on ${PROVIDERS[provider].label}`}
          className="flex-row items-center justify-between px-3 py-2.5 rounded-md"
          key={provider}
          onPress={() => openExternalUrl(url)}
        >
          <View className="flex-row items-center gap-3">
            <ProviderIcon id={provider} size={18} />
            <Text className="text-muted font-sans-semibold text-sm">
              Log manually on {PROVIDERS[provider].label}
            </Text>
          </View>
          <Ionicons color={mutedColor} name="open-outline" size={16} />
        </PresstableOpacity>
      ))}
    </View>
  );
}

/**
 * One failure/skip message line, with a "Log on {Provider}" external link
 * beneath it when the provider's item URL is buildable (plan 0022 R5/R6).
 */
function OutcomeMessage({
  outcome,
  message,
  item,
  accentColor,
}: {
  outcome: ProviderLogOutcome;
  message: string;
  item: NormalizedMediaItem;
  accentColor?: string;
}) {
  const link = manualLinkForOutcome(outcome, item);
  return (
    <View>
      <Text className="text-muted font-sans text-xs">{message}</Text>
      {link != null && (
        <OutcomeLink accentColor={accentColor} provider={outcome.provider} url={link} />
      )}
    </View>
  );
}

/**
 * The shared confirm/backdate sheet behind every log action (plan 0010
 * extracts this from the movie `LogMediaButton`). It shows the write targets,
 * a backdate field, per-provider partial failure (kept in context rather than
 * flashed after close), and the confirm/cancel pair. The parent owns the
 * `useLogMedia` mutation (so the season picker and the sheet share one), the
 * `watchedAt` state, and the confirm handler that fills `LogMediaVariables`.
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
  const accent = useCSSVariable('--color-accent');
  const accentColor = typeof accent === 'string' ? accent : undefined;
  // Same gate as before — every provider in TAG_PROVIDERS genuinely consumes
  // tags, so narrowing this would silently drop working Serializd functionality.
  const tagProviders = TAG_PROVIDERS.filter((id) =>
    selectedProviders.includes(id),
  );
  const showTagsField = onTagsChange != null && tagProviders.length > 0;
  // Reconcile skips (no reason — already in sync) keep the original combined
  // copy; adapter-reported skips (a reason, e.g. an unresolvable Serializd
  // season, plan 0017 R9) get their own line + manual link (plan 0022 R6).
  const { reconcileSkipped, reasonedSkips } =
    result != null
      ? splitSkippedOutcomes(result.outcomes)
      : { reconcileSkipped: [], reasonedSkips: [] };

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
      <ManualLogRows item={item} manual={manualTargets} />
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
      {result != null && result.failed.length > 0 && (
        <View className="mt-3 gap-1">
          <Text className="text-accent font-sans text-sm">
            Failed on {labels(result.failed)}
            {result.succeeded.length > 0
              ? ` — ${labels(result.succeeded)} was logged.`
              : '.'}
          </Text>
          {/* The per-provider reason (e.g. Letterboxd film not found, session
              expired) — without it every failure looks identical (plan 0012).
              Each line gets a "Log on {Provider}" manual link when buildable
              (plan 0022 R5). */}
          {result.outcomes
            .filter((outcome) => outcome.status === 'error')
            .map((outcome) => (
              <OutcomeMessage
                accentColor={accentColor}
                item={item}
                key={outcome.provider}
                message={outcome.message}
                outcome={outcome}
              />
            ))}
        </View>
      )}
      {reconcileSkipped.length > 0 && (
        <Text className="text-muted font-sans text-sm mt-3">
          {labels(reconcileSkipped)} already had this logged — skipped to keep
          both in sync.
        </Text>
      )}
      {reasonedSkips.length > 0 && (
        <View className="mt-3 gap-1">
          {reasonedSkips.map((outcome) => (
            <OutcomeMessage
              accentColor={accentColor}
              item={item}
              key={outcome.provider}
              message={`${PROVIDERS[outcome.provider].label}: ${outcome.reason}`}
              outcome={outcome}
            />
          ))}
        </View>
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
