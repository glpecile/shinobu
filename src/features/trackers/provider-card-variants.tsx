import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { Sheet } from '@/components/sheet';
import { CONTROL_RADIUS } from '@/features/trackers/card-shell';
import {
  capabilityLabels,
  PROVIDER_CHIP,
  PROVIDER_DOT,
  PROVIDER_STRIPE,
} from '@/features/trackers/provider-style';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';

/** Every variant's card sits on the same surface, radius and padding. */
const SHELL = 'bg-surface border border-border rounded-card p-5';

export interface VariantCardProps {
  id: ProviderId;
  connected: boolean;
  /** The provider's own connect affordance, unchanged from today. */
  connectButton: React.ReactNode;
  onDisconnect: () => void;
  /** Present only for tokenless sessions (Letterboxd). */
  username: string | undefined;
}

function statusLine(connected: boolean, username: string | undefined): string {
  if (!connected) return 'Not connected';
  return username != null ? `Connected as ${username}` : 'Connected';
}

/**
 * The same status, short enough to survive a 390px viewport minus the 64px web
 * nav rail *and* an always-visible Disconnect button beside it. The colored dot
 * already carries "connected", so the username alone says the rest — the long
 * form truncated to "Connecte…" in that column, which reads as a bug.
 */
function compactStatus(connected: boolean, username: string | undefined): string {
  if (!connected) return 'Not connected';
  return username ?? 'Connected';
}

function DisconnectButton({
  onPress,
  quiet,
}: {
  onPress: () => void;
  quiet?: boolean;
}) {
  return (
    <PresstableOpacity
      className={
        quiet === true
          ? `shrink-0 border border-border px-4 py-2 ${CONTROL_RADIUS}`
          : `shrink-0 border border-accent px-4 py-2 ${CONTROL_RADIUS}`
      }
      onPress={onPress}
    >
      <Text
        className={
          quiet === true
            ? 'text-muted font-sans-semibold text-sm'
            : 'text-accent font-sans-semibold text-sm'
        }
      >
        Disconnect
      </Text>
    </PresstableOpacity>
  );
}

/* ------------------------------------------------------------------ *
 * Variant 1 — Refined rows                                            *
 * The current visual language, disciplined: one padding, one radius,   *
 * the icon in a subtle chip, a brand-colored status dot, and a quiet   *
 * bordered Disconnect instead of a loud accent-outlined one.           *
 * ------------------------------------------------------------------ */
export function VariantOneCard({
  id,
  connected,
  connectButton,
  onDisconnect,
  username,
}: VariantCardProps) {
  return (
    <View className={SHELL}>
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-md bg-background border border-border items-center justify-center">
          <ProviderIcon id={id} size={22} />
        </View>
        <View className="flex-1 ml-3 mr-3">
          <Text
            className="text-foreground font-sans-semibold text-base"
            numberOfLines={1}
          >
            {PROVIDERS[id].label}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            {connected && (
              <View className={`w-1.5 h-1.5 rounded-full ${PROVIDER_DOT[id]}`} />
            )}
            <Text className="flex-1 text-muted font-sans text-xs" numberOfLines={1}>
              {compactStatus(connected, username)}
            </Text>
          </View>
        </View>
        {connected && <DisconnectButton onPress={onDisconnect} quiet />}
      </View>
      {!connected && <View className="mt-4">{connectButton}</View>}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant 2 — Brand-accented cards                                    *
 * Per-provider identity: an edge stripe and tinted icon chip in the    *
 * provider's own color, plus capability chips read off the registry.   *
 * Disconnect hides until hover on desktop web, stays put on touch.     *
 * ------------------------------------------------------------------ */
export function VariantTwoCard({
  id,
  connected,
  connectButton,
  onDisconnect,
  username,
}: VariantCardProps) {
  const [hovered, setHovered] = useState(false);
  // `group-hover:` does not exist in Uniwind, so the reveal is a JS flag
  // (docs/solutions/uniwind-no-group-hover-use-pointer-events.md). Touch
  // platforms never hover, so there the button is always visible.
  const revealsOnHover = process.env.EXPO_OS === 'web';
  const showDisconnect = connected && (!revealsOnHover || hovered);

  return (
    <View
      className={`overflow-hidden ${SHELL}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Decorative only — never over a pressable, and inert either way
          (docs/solutions/android-pressable-over-textinput.md). */}
      <View
        className={`absolute left-0 top-0 bottom-0 w-1 ${PROVIDER_STRIPE[id]}`}
        pointerEvents="none"
      />
      <View className="flex-row items-center">
        <View
          className={`w-10 h-10 rounded-md border items-center justify-center ${PROVIDER_CHIP[id]}`}
        >
          <ProviderIcon id={id} size={22} />
        </View>
        <View className="flex-1 ml-3 mr-3">
          <Text
            className="text-foreground font-sans-semibold text-base"
            numberOfLines={1}
          >
            {PROVIDERS[id].label}
          </Text>
          <Text className="text-muted font-sans text-xs mt-0.5" numberOfLines={1}>
            {statusLine(connected, username)}
          </Text>
        </View>
        {showDisconnect && <DisconnectButton onPress={onDisconnect} />}
      </View>

      <View className="flex-row flex-wrap gap-1.5 mt-3">
        {capabilityLabels(id).map((label) => (
          <View
            className="border border-border rounded-full px-2.5 py-0.5"
            key={label}
          >
            <Text className="text-muted font-sans text-xs">{label}</Text>
          </View>
        ))}
      </View>

      {!connected && <View className="mt-4">{connectButton}</View>}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant 3 — Compact list + detail sheet                             *
 * Every provider is the same slim row whatever its state; the connect  *
 * form (or the connected detail + Disconnect) moves into a sheet, so a *
 * provider with a long setup form stops dominating the screen.         *
 * ------------------------------------------------------------------ */
export function VariantThreeRow({
  id,
  connected,
  connectButton,
  onDisconnect,
  username,
}: VariantCardProps) {
  const [open, setOpen] = useState(false);
  const muted = useCSSVariable('--color-muted');

  return (
    <>
      {/* Default accessibilityRole on purpose — any other role silently kills
          onPress on web (docs/solutions/web-pressto-accessibility-role-kills-onpress.md). */}
      <PresstableOpacity
        accessibilityLabel={`${PROVIDERS[id].label} — ${statusLine(connected, username)}`}
        className="flex-row items-center bg-surface border border-border rounded-card px-4 py-3"
        onPress={() => setOpen(true)}
      >
        <ProviderIcon id={id} size={22} />
        <Text
          className="flex-1 ml-3 text-foreground font-sans-semibold text-base"
          numberOfLines={1}
        >
          {PROVIDERS[id].label}
        </Text>
        {connected && (
          <View className={`w-1.5 h-1.5 rounded-full mr-2 ${PROVIDER_DOT[id]}`} />
        )}
        <Text className="text-muted font-sans text-xs mr-1" numberOfLines={1}>
          {connected ? (username ?? 'Connected') : 'Connect'}
        </Text>
        <Ionicons
          color={typeof muted === 'string' ? muted : undefined}
          name="chevron-forward"
          size={16}
        />
      </PresstableOpacity>

      {/* The sheet's own content scroller handles tall forms (Trakt's setup)
          via the `shrink` pattern — docs/solutions/bottom-sheet-content-detent-clips-tall-content.md. */}
      <Sheet onClose={() => setOpen(false)} open={open}>
        <View className="flex-row items-center gap-3 mb-1">
          <ProviderIcon id={id} size={24} />
          <Text className="text-foreground font-display text-xl">
            {PROVIDERS[id].label}
          </Text>
        </View>
        <Text className="text-muted font-sans text-sm mb-4">
          {statusLine(connected, username)}
        </Text>
        {connected ? (
          <View className="flex-row">
            <DisconnectButton
              onPress={() => {
                onDisconnect();
                setOpen(false);
              }}
            />
          </View>
        ) : (
          connectButton
        )}
      </Sheet>
    </>
  );
}
