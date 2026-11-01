import "@/global.css";

import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "react-error-boundary";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppShell } from "@/components/app-shell";
import { BootSplash, dismissBootSplash } from "@/components/boot-splash";
import { ErrorFallback } from "@/components/error-fallback";
import { endLaunchReplay } from "@/lib/http/client";
import { fonts } from "@/lib/fonts";
import { LetterboxdWriteBridge } from "@/components/letterboxd-write-bridge";
import { Lightbox } from "@/components/lightbox";
import { LightboxProvider } from "@/components/lightbox/state";
import { createQueryPersister, retainPersistedQueries } from "@/state/queries/persist";
import { PersistQueryClientProvider } from "@/state/queries/persist-provider";
import { createQueryClient } from "@/state/queries/query-client";
import { UpNextPrefetch } from "@/features/up-next/up-next-prefetch";
import { SessionCacheSync } from "@/features/trackers/session-cache-sync";
import { CatchUpLogSheet } from "@/features/log-media/session/catch-up-log-sheet";
import { CatchUpLogProvider } from "@/features/log-media/session/state";
import { usePageEnterStyle } from "@/lib/page-transition";
import { SheetProvider } from "@/components/sheet";
import { Platform, useColorScheme } from "react-native";
// Side-effect import: TaskManager.defineTask must run at module-evaluation
// time so a headless background launch can find the task (plan 0020 KTD-4).
import "@/features/notifications/background-task";
import { NotificationsRuntime } from "@/features/notifications/notifications-runtime";
import { ToastHost } from "@/components/toast-host";
import { PROVIDERS } from "@/lib/providers/registry";
import { toast } from "@/lib/toast";
import { onProviderConnected } from "@/state/session/tokens";
import { applyThemePreference } from "@/state/prefs/theme";

SplashScreen.preventAutoHideAsync();

// Module scope, not an effect: AniList's web return connects inside the home
// route's first effect, which runs before any effect here could subscribe.
onProviderConnected((id) => toast.success(`Connected to ${PROVIDERS[id].label}`));
applyThemePreference();

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts(fonts);

  // One QueryClient per app lifetime. TanStack Query handles provider fetches,
  // token refresh retries, and feed invalidation on connect/disconnect.
  const [queryClient] = useState(() => {
    const client = retainPersistedQueries(createQueryClient());
    // A write makes the launch's replayed responses stale.
    client.getMutationCache().subscribe((event) => {
      if (event.type === "added") endLaunchReplay();
    });
    return client;
  });
  // …and one persister, so the home feed's critical path restores from MMKV on
  // launch and revalidates behind the restored data (state/queries/persist.ts).
  const [persister] = useState(createQueryPersister);

  // Matches --color-background in global.css. React Navigation's Stack
  // paints this as an inline style independent of Uniwind's stylesheet, so
  // without it the screen container flashes React Navigation's own default
  // theme background (`rgb(242, 242, 242)`) instead of Shinobu's own
  // light/dark background — see docs/solutions/web-fouc-on-boot.md.
  //
  // Web hands the browser the custom property instead of a resolved hex:
  // react-native-web forwards a `var()` color untouched, and the web build is
  // a static export whose prerender has no `matchMedia`, so `useColorScheme()`
  // is `null` there and every prerendered page baked `#ffffff` into this
  // container. React never patches a hydrated element's inline style, so that
  // white sat under the whole app and each page-enter fade read as white →
  // black. See docs/solutions/web-prerender-bakes-js-resolved-colors.md.
  const colorScheme = useColorScheme();
  const backgroundColor =
    Platform.OS === "web"
      ? "var(--color-background)"
      : colorScheme === "dark"
        ? "#0a0a0a"
        : "#ffffff";
  // The screen container above is what fades on a page enter, so whatever
  // React Navigation paints *behind* it is what shows through mid-fade — and
  // that is its own theme background, prerendered as `DefaultTheme`'s
  // `rgb(242, 242, 242)` for the same no-DOM reason. Same custom property, so
  // the two agree at every opacity.
  const navigationBase = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme =
    Platform.OS === "web"
      ? {
          ...navigationBase,
          colors: { ...navigationBase.colors, background: backgroundColor },
        }
      : navigationBase;
  // Web-only blur-fade on every pushed screen (no-op on native, which has its
  // own stack transition).
  const pageEnter = usePageEnterStyle();

  const fontsReady = fontsLoaded || fontError != null;
  // Web's splash is static HTML in +html.tsx.
  const [splashPainted, setSplashPainted] = useState(Platform.OS === "web");
  const appReady = Platform.OS === "web" || (fontsReady && splashPainted);
  useEffect(() => {
    if (fontsReady) {
      dismissBootSplash();
    }
  }, [fontsReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persister={persister}
      >
      {appReady && (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <KeyboardProvider>
          <SheetProvider>
           <LightboxProvider>
           <CatchUpLogProvider>
            {/* ThemeProvider keeps the native tab bar / navigator chrome themed
                and prevents header-button flicker when switching tabs. */}
            <ThemeProvider value={navigationTheme}>
              <AppShell>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    // Android 13+'s default push runs 450 ms, and the
                    // duration can't be changed; this slide runs 200 ms.
                    animation: process.env.EXPO_OS === "android" ? "ios_from_right" : undefined,
                    contentStyle: [{ backgroundColor }, pageEnter],
                  }}
                >
                  {/* Bottom tabs (native) / sidebar-hosted (web). Detail routes
                      sit at the root so they push over the tab bar. */}
                  <Stack.Screen name="(tabs)" options={{ title: "Shinobu" }} />
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
                {/* Hidden authenticated WebView that runs Letterboxd writes
                    (native only; renders null on web). */}
                <LetterboxdWriteBridge />
                {/* Release-notification refresh + background task lifecycle
                    (native only; renders null on web). */}
                <NotificationsRuntime />
                {/* Purges a provider's caches when its session disappears and
                    refreshes the merged gathers when one connects. */}
                <SessionCacheSync />
                {/* Warms the Up Next slot on launch and on every foreground
                    transition, so its waterfall overlaps app start. */}
                <UpNextPrefetch />
                {/* Fullscreen image viewer overlay (web); null on native,
                    where galeria renders the zoom inline. */}
                <Lightbox />
                {/* Every logging trigger uses this host so a card or episode
                    row that re-keys after a write can't unmount its session. */}
                <CatchUpLogSheet />
                {/* The toast Toaster host — sonner-native on native, sonner
                    on web (plan 0032 U1). */}
                <ToastHost />
              </AppShell>
            </ThemeProvider>
           </CatchUpLogProvider>
           </LightboxProvider>
          </SheetProvider>
        </KeyboardProvider>
      </ErrorBoundary>
      )}
      <BootSplash ready={appReady} onPainted={() => setSplashPainted(true)} />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
