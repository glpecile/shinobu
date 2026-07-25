import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import Head from '@/components/head';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ConnectAniListButton } from '@/components/connect-anilist-button';
import { ConnectLetterboxdButton } from '@/components/connect-letterboxd-button';
import { ConnectSerializdButton } from '@/components/connect-serializd-button';
import { ConnectTmdbTokenSection } from '@/components/connect-tmdb-token';
import { ConnectTraktButton } from '@/components/connect-trakt-button';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { PresstableOpacity } from '@/components/presstable';
import { ProviderIcon } from '@/components/provider-icon';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { NotificationsSettingsSection } from '@/features/notifications/notifications-settings';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { unhideItem, useHiddenItems } from '@/state/prefs/hidden-items';
import {
  useConnectedProviders,
  useDisconnectProvider,
} from '@/state/session';
import { getProviderSession } from '@/state/session/tokens';

function ConnectedRow({ id }: { id: ProviderId }) {
  const disconnect = useDisconnectProvider();
  // Tokenless sessions (Letterboxd) carry the username — worth showing, since
  // a wrong username is the only way that connection can be "broken".
  const username = getProviderSession(id)?.username;

  return (
    <View className="flex-row items-center justify-between bg-surface border border-border rounded-xl px-5 py-4">
      <View className="flex-row items-center gap-3">
        <ProviderIcon id={id} size={24} />
        <View>
          <Text className="text-foreground font-sans-semibold text-base">
            {PROVIDERS[id].label}
          </Text>
          <Text className="text-muted font-sans text-xs mt-0.5">
            {username != null ? `Connected as ${username}` : 'Connected'}
          </Text>
        </View>
      </View>
      <PresstableOpacity
        className="border border-accent px-4 py-2 rounded"
        onPress={() => disconnect(id)}
      >
        <Text className="text-accent font-sans-semibold text-sm">
          Disconnect
        </Text>
      </PresstableOpacity>
    </View>
  );
}

function TraktConnectRow() {
  const connected = useConnectedProviders();

  // Already listed under the "Connected" section — don't render a second row.
  if (connected.includes('trakt')) {
    return null;
  }

  return (
    <View className="bg-surface border border-border rounded-xl p-5">
      <View className="flex-row items-center gap-3 mb-3">
        <ProviderIcon id="trakt" size={24} />
        <Text className="text-foreground font-sans-semibold text-base">
          Trakt
        </Text>
      </View>
      <ConnectTraktButton />
    </View>
  );
}

function AniListConnectRow() {
  const connected = useConnectedProviders();

  if (connected.includes('anilist')) {
    return null;
  }

  return (
    <View className="bg-surface border border-border rounded-xl p-5">
      <View className="flex-row items-center gap-3 mb-3">
        <ProviderIcon id="anilist" size={24} />
        <Text className="text-foreground font-sans-semibold text-base">
          AniList
        </Text>
      </View>
      {/* The button renders its own copy: one-tap when this build embeds a
          client id, or the one-time client-id setup form when it doesn't. */}
      <ConnectAniListButton />
    </View>
  );
}

function LetterboxdConnectRow() {
  const connected = useConnectedProviders();

  if (connected.includes('letterboxd')) {
    return null;
  }

  return (
    <View className="bg-surface border border-border rounded-xl p-5">
      <View className="flex-row items-center gap-3 mb-3">
        <ProviderIcon id="letterboxd" size={24} />
        <Text className="text-foreground font-sans-semibold text-base">
          Letterboxd
        </Text>
      </View>
      <ConnectLetterboxdButton />
    </View>
  );
}

function SerializdConnectRow() {
  const connected = useConnectedProviders();

  if (connected.includes('serializd')) {
    return null;
  }

  return (
    <View className="bg-surface border border-border rounded-xl p-5">
      <View className="flex-row items-center gap-3 mb-3">
        <ProviderIcon id="serializd" size={24} />
        <Text className="text-foreground font-sans-semibold text-base">
          Serializd
        </Text>
      </View>
      {/* WebView token capture on native, email/password form on web. */}
      <ConnectSerializdButton />
    </View>
  );
}

/**
 * Feed items hidden from a card's actions dialog. Listed here (the only
 * settings surface) so hiding is always reversible; the row itself opens the
 * item's details page (which resolves hidden items too — includeHidden).
 */
function HiddenItemsSection() {
  const router = useRouter();
  const hidden = useHiddenItems();
  const muted = useCSSVariable('--color-muted');

  if (hidden.length === 0) return null;

  return (
    <View className="mt-6">
      <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
        Hidden items
      </Text>
      <View className="gap-3">
        {hidden.map((item) => (
          <View
            className="flex-row items-center justify-between bg-surface border border-border rounded-xl px-5 py-4 opacity-60"
            key={item.id}
          >
            <PresstableOpacity
              accessibilityLabel={`Open ${item.title}`}
              className="flex-1 flex-row items-center gap-3 mr-3"
              onPress={() => router.push(routes.details(item.id))}
            >
              <Ionicons
                color={typeof muted === 'string' ? muted : undefined}
                name="eye-off-outline"
                size={18}
              />
              <Text
                className="flex-1 text-foreground font-sans-semibold text-base"
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </PresstableOpacity>
            <PresstableOpacity
              className="border border-border px-4 py-2 rounded"
              onPress={() => unhideItem(item.id)}
            >
              <Text className="text-foreground font-sans-semibold text-sm">
                Show
              </Text>
            </PresstableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ConnectScreen() {
  const connected = useConnectedProviders();
  const queryClient = useQueryClient();
  const disconnected = (Object.keys(PROVIDERS) as ProviderId[]).filter(
    (id) => !connected.includes(id),
  );

  return (
    <View className="flex-1 bg-background">
      <Head>
        <title>Manage Trackers — Shinobu</title>
      </Head>
      {/* A top-level tab now (native tab bar / web sidebar) — no back button. */}
      <View className={`flex-row items-center px-6 ${screenHeaderTopPadding} pb-4`}>
        <Text className="text-2xl font-display text-foreground">
          Manage Trackers
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <RefreshableScrollView
          className="flex-1 px-6"
          // Native clears the bottom tab bar (unmeasurable height); web doesn't.
          contentContainerClassName={
            process.env.EXPO_OS === 'web' ? 'pb-8' : 'pb-24'
          }
          keyboardShouldPersistTaps="handled"
          // This screen has no server data of its own — the useful refresh is
          // marking every cached query stale so the feed refetches on return.
          onRefresh={() => queryClient.invalidateQueries()}
        >
        {connected.length > 0 && (
          <View className="mb-6">
            <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
              Connected
            </Text>
            <View className="gap-3">
              {connected.map((id) => (
                <ConnectedRow id={id} key={id} />
              ))}
            </View>
          </View>
        )}

        {disconnected.length > 0 && (
          <View>
            <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
              Accounts
            </Text>
            <View className="gap-3">
              <TraktConnectRow />
              <AniListConnectRow />
              <LetterboxdConnectRow />
              <SerializdConnectRow />
            </View>
          </View>
        )}

        <ConnectTmdbTokenSection />
        <NotificationsSettingsSection />
        <HiddenItemsSection />
        </RefreshableScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
