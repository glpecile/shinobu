import "@/global.css";

import {
  Inter_400Regular,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { ErrorBoundary } from "react-error-boundary";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppShell } from "@/components/app-shell";
import { ErrorFallback } from "@/components/error-fallback";
import { iconFonts } from "@/lib/icon-fonts";
import { LetterboxdWriteBridge } from "@/components/letterboxd-write-bridge";
import { Lightbox } from "@/components/lightbox";
import { LightboxProvider } from "@/components/lightbox/state";
import { createQueryClient } from "@/state/queries/query-client";
import { SheetProvider } from "@/components/sheet";
import { useColorScheme } from "react-native";
// Side-effect import: TaskManager.defineTask must run at module-evaluation
// time so a headless background launch can find the task (plan 0020 KTD-4).
import "@/features/notifications/background-task";
import { NotificationsRuntime } from "@/features/notifications/notifications-runtime";
import { useNotificationTapNavigation } from "@/features/notifications/use-notification-tap-navigation";

SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    // Icon fonts are only populated on web — native bundles them via the
    // config plugins (see lib/icon-fonts).
    ...iconFonts,
  });

  // One QueryClient per app lifetime. TanStack Query handles provider fetches,
  // token refresh retries, and feed invalidation on connect/disconnect.
  const [queryClient] = useState(createQueryClient);

  // Matches --color-background in global.css. React Navigation's Stack
  // paints this as an inline style independent of Uniwind's stylesheet, so
  // without it the screen container flashes React Navigation's own default
  // theme background (`rgb(242, 242, 242)`) instead of Shinobu's own
  // light/dark background — see docs/solutions/web-fouc-on-boot.md.
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#0a0a0a" : "#ffffff";

  // Notification tap → details route, in all three app states (R10).
  useNotificationTapNavigation();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      // `#boot-loader` is static markup from `+html.tsx`, not part of this
      // React tree — see the comment there for why it exists. Only web
      // renders it (`document` doesn't exist on native).
      if (typeof document !== "undefined") {
        document.getElementById("boot-loader")?.remove();
      }
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <SheetProvider>
           <LightboxProvider>
            {/* ThemeProvider keeps the native tab bar / navigator chrome themed
                and prevents header-button flicker when switching tabs. */}
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <AppShell>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor },
                  }}
                >
                  {/* Bottom tabs (native) / sidebar-hosted (web). Detail routes
                      sit at the root so they push over the tab bar. */}
                  <Stack.Screen name="(tabs)" options={{ title: "Shinobu" }} />
                  <Stack.Screen name="details/[id]" />
                  <Stack.Screen name="person/[id]" />
                  <Stack.Screen name="person/lookup" />
                  <Stack.Screen name="studio/[id]" />
                  <Stack.Screen name="studio/lookup" />
                  <Stack.Screen name="watchlist/letterboxd" />
                </Stack>
                {/* Hidden authenticated WebView that runs Letterboxd writes
                    (native only; renders null on web). */}
                <LetterboxdWriteBridge />
                {/* Release-notification refresh + background task lifecycle
                    (native only; renders null on web). */}
                <NotificationsRuntime />
                {/* Fullscreen image viewer overlay (web); null on native,
                    where galeria renders the zoom inline. */}
                <Lightbox />
              </AppShell>
            </ThemeProvider>
           </LightboxProvider>
          </SheetProvider>
        </QueryClientProvider>
        </KeyboardProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
