import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ConnectTraktButton } from '@/components/connect-trakt-button';
import { PROVIDERS } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import {
  useConnectedProviders,
  useDisconnectProvider,
} from '@/state/session';

function ConnectedRow({ id }: { id: ProviderId }) {
  const disconnect = useDisconnectProvider();

  return (
    <View className="flex-row items-center justify-between bg-surface border border-border rounded-xl px-5 py-4">
      <View>
        <Text className="text-foreground font-sans-semibold text-base">
          {PROVIDERS[id].label}
        </Text>
        <Text className="text-muted font-sans text-xs mt-0.5">Connected</Text>
      </View>
      <Pressable
        className="border border-accent px-4 py-2 rounded active:opacity-80"
        onPress={() => disconnect(id)}
      >
        <Text className="text-accent font-sans-semibold text-sm">
          Disconnect
        </Text>
      </Pressable>
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
      <Text className="text-foreground font-sans-semibold text-base mb-3">
        Trakt
      </Text>
      <ConnectTraktButton />
    </View>
  );
}

function ComingSoonRow({ id }: { id: ProviderId }) {
  return (
    <View className="flex-row items-center justify-between bg-surface border border-border rounded-xl px-5 py-4 opacity-60">
      <View>
        <Text className="text-foreground font-sans-semibold text-base">
          {PROVIDERS[id].label}
        </Text>
        <Text className="text-muted font-sans text-xs mt-0.5">
          {id === 'letterboxd' ? 'Waiting on API access' : 'Coming soon'}
        </Text>
      </View>
    </View>
  );
}

export default function ConnectScreen() {
  const router = useRouter();
  const connected = useConnectedProviders();
  const foreground = useCSSVariable('--color-foreground');
  const disconnected = (Object.keys(PROVIDERS) as ProviderId[]).filter(
    (id) => !connected.includes(id),
  );

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-6 pt-16 pb-4">
        <Pressable
          accessibilityLabel="Back"
          className="w-10 h-10 -ml-2 items-center justify-center"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace(routes.home)
          }
        >
          <Ionicons
            color={typeof foreground === 'string' ? foreground : undefined}
            name="arrow-back"
            size={22}
          />
        </Pressable>
        <Text className="text-2xl font-display text-foreground ml-2">
          Manage Trackers
        </Text>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerClassName="pb-8">
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

        <View>
          <Text className="text-muted font-sans-semibold text-xs uppercase tracking-wider mb-3">
            Accounts
          </Text>
          <View className="gap-3">
            <TraktConnectRow />
            {disconnected
              .filter((id) => id !== 'trakt')
              .map((id) => (
                <ComingSoonRow id={id} key={id} />
              ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
