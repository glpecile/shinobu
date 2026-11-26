import '@/global.css';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from 'react-error-boundary';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AppShell } from '@/components/app-shell';
import { BootSplash, dismissBootSplash } from '@/components/boot-splash';
import { ErrorFallback } from '@/components/error-fallback';
import { reloadOnStaleBundle } from '@/lib/stale-bundle';
import { endLaunchReplay } from '@/lib/http/client';
import { fonts } from '@/lib/fonts';
import { LetterboxdWriteBridge } from '@/components/letterboxd-write-bridge';
import { Lightbox } from '@/components/lightbox';
import { LightboxProvider } from '@/components/lightbox/state';
import { createQueryPersister, retainPersistedQueries } from '@/state/queries/persist';
import { PersistQueryClientProvider } from '@/state/queries/persist-provider';
import { createQueryClient } from '@/state/queries/query-client';
import { UpNextPrefetch } from '@/features/up-next/up-next-prefetch';
import { SessionCacheSync } from '@/features/trackers/session-cache-sync';
import { CatchUpLogSheet } from '@/features/log-media/session/catch-up-log-sheet';
import { CatchUpLogProvider } from '@/features/log-media/session/state';
import { PendingLogReplayer } from '@/features/log-media/pending-log-replayer';
import { watchConnectivity } from '@/lib/online';
import { usePageEnterStyle } from '@/lib/page-transition';
import { SheetProvider } from '@/components/sheet';
import { Platform, useColorScheme } from 'react-native';
// Expo TaskManager.defineTask must run at module-evaluation time for headless background launches.
import '@/features/notifications/background-task';
import { NotificationsRuntime } from '@/features/notifications/notifications-runtime';
import { ToastHost } from '@/components/toast-host';
import { PROVIDERS } from '@/lib/providers/registry';
import { toast } from '@/lib/toast';
import { onProviderConnected } from '@/state/session/tokens';
import { applyThemePreference } from '@/state/prefs/theme';

SplashScreen.preventAutoHideAsync();

onProviderConnected((id) => toast.success(`Connected to ${PROVIDERS[id].label}`));
applyThemePreference();
watchConnectivity();

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts(fonts);

  const [queryClient] = useState(() => {
    const client = retainPersistedQueries(createQueryClient());
    client.getMutationCache().subscribe((event) => {
      if (event.type === 'added') endLaunchReplay();
    });
    return client;
  });
  const [persister] = useState(createQueryPersister);

  // React Navigation paints its own default background inline (docs/solutions/web-fouc-on-boot.md).
  // Web uses var() because static prerender has no matchMedia and React doesn't patch hydrated
  // inline styles (docs/solutions/web-prerender-bakes-js-resolved-colors.md).
  const colorScheme = useColorScheme();
  const backgroundColor =
    Platform.OS === 'web'
      ? 'var(--color-background)'
      : colorScheme === 'dark'
        ? '#0a0a0a'
        : '#ffffff';
  const navigationBase = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme =
    Platform.OS === 'web'
      ? {
          ...navigationBase,
          colors: { ...navigationBase.colors, background: backgroundColor },
        }
      : navigationBase;
  const pageEnter = usePageEnterStyle();

  const fontsReady = fontsLoaded || fontError != null;
  const [splashPainted, setSplashPainted] = useState(Platform.OS === 'web');
  const appReady = Platform.OS === 'web' || (fontsReady && splashPainted);
  useEffect(() => {
    if (fontsReady) {
      dismissBootSplash();
    }
  }, [fontsReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persister={persister}>
        {appReady && (
          <ErrorBoundary FallbackComponent={ErrorFallback} onError={reloadOnStaleBundle}>
            <KeyboardProvider>
              <LightboxProvider>
                <CatchUpLogProvider>
                  <SheetProvider>
                    <ThemeProvider value={navigationTheme}>
                      <AppShell>
                        <Stack
                          screenOptions={{
                            headerShown: false,
                            contentStyle: [{ backgroundColor }, pageEnter],
                          }}
                        >
                          <Stack.Screen name="(tabs)" options={{ title: 'Shinobu' }} />
                          <Stack.Screen name="details/[id]" />
                          <Stack.Screen name="details/[provider]/[id]/index" />
                          <Stack.Screen name="details/[provider]/[id]/[media-type]" />
                          <Stack.Screen name="episode/[id]" />
                          <Stack.Screen name="episode/[provider]/[id]/[...episode]" />
                          <Stack.Screen name="person/[id]" />
                          <Stack.Screen name="person/[provider]/[id]" />
                          <Stack.Screen name="person/lookup" />
                          <Stack.Screen name="person/lookup/[name]" />
                          <Stack.Screen name="studio/[id]" />
                          <Stack.Screen name="studio/tmdb/[id]" />
                          <Stack.Screen name="studio/lookup" />
                          <Stack.Screen name="studio/lookup/[name]" />
                          <Stack.Screen name="watchlist/index" />
                          <Stack.Screen name="lists/index" />
                          <Stack.Screen name="lists/letterboxd/index" />
                          <Stack.Screen name="lists/letterboxd/[owner]/[slug]" />
                          <Stack.Screen name="lists/serializd/index" />
                          <Stack.Screen name="lists/serializd/[id]" />
                          <Stack.Screen name="anime-seasons/index" />
                        </Stack>
                        {/* Here, not in a screen: a frozen unfocused tab misses a
                    theme change and leaves light icons on a light bar. */}
                        <StatusBar style="auto" />
                        <LetterboxdWriteBridge />
                        <NotificationsRuntime />
                        <SessionCacheSync />
                        <UpNextPrefetch />
                        <Lightbox />
                        <CatchUpLogSheet />
                        <PendingLogReplayer />
                        <ToastHost />
                      </AppShell>
                    </ThemeProvider>
                  </SheetProvider>
                </CatchUpLogProvider>
              </LightboxProvider>
            </KeyboardProvider>
          </ErrorBoundary>
        )}
        <BootSplash ready={appReady} onPainted={() => setSplashPainted(true)} />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
