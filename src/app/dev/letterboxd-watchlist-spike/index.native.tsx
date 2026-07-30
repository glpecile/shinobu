import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { NitroWebView, callback } from 'nitro-webview';

import { Button } from '@/components/button';
import { KeyboardAvoidingView } from '@/components/keyboard-avoiding-view';
import { screenHeaderTopPadding } from '@/components/screen-header-spacing';
import { cn } from '@/lib/cn';
import { LETTERBOXD_BASE_URL } from '@/lib/providers/letterboxd';
import {
  buildCaptureScript,
  captureReport,
  parseCaptureMessage,
  type CapturedRequest,
} from '@/lib/providers/letterboxd/watchlist-capture';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';

/**
 * U6's capture harness (plan 0031 R7/R37) — a **dev screen, not a feature**.
 * Reachable only by typing `/dev/letterboxd-watchlist-spike`; nothing links to
 * it, and it must not grow a link.
 *
 * Why a *visible* WebView when the app already has a hidden one: the spike's
 * whole method is driving **Letterboxd's own watchlist control**, in both
 * directions, and watching what the site composes. Nothing here fabricates a
 * request — that is the point. An adapter written against a guessed endpoint is
 * exactly what R37 forbids, and the likely toggle semantics (KTD-6) make a wrong
 * guess *remove* a film while reporting success.
 *
 * Delete it once `docs/solutions/letterboxd-watchlist-write.md` records the
 * classification — or keep it, like `letterboxd-write-spike.ts`, as the standing
 * way to re-check when Letterboxd moves the endpoint.
 */
export default function LetterboxdWatchlistSpikeScreen() {
  const hasSession = useHasLetterboxdWriteSession();
  const [slug, setSlug] = useState('the-thing');
  const [uri, setUri] = useState(`${LETTERBOXD_BASE_URL}/film/the-thing/`);
  const [captures, setCaptures] = useState<CapturedRequest[]>([]);
  const [webView, setWebView] = useState<{
    evaluateJavaScript(code: string): Promise<string>;
  } | null>(null);

  if (!hasSession) {
    return (
      <View className={cn('flex-1 bg-background px-6', screenHeaderTopPadding)}>
        <Text className="text-2xl font-display text-foreground">
          Connect Letterboxd first
        </Text>
        <Text className="text-muted font-sans mt-3">
          The capture only means anything inside a signed-in session — that is the
          whole reason the spike runs in a WebView rather than over fetch.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-background">
      <View className={cn('px-4 gap-2', screenHeaderTopPadding, 'pb-2')}>
        <Text className="text-2xl font-display text-foreground">
          Watchlist capture (U6)
        </Text>
        {/* One line, deliberately: Letterboxd's actions panel is a fixed
            overlay sized to the WebView viewport, and on a phone the panel
            clips its watched/liked/watchlist icon row unless the WebView gets
            most of the screen (observed 2026-07-29 on an iPhone 17 Pro sim). */}
        <Text className="text-muted font-sans text-sm">
          Tap the site&rsquo;s own watchlist control — add, then remove.
        </Text>
        <View className="flex-row gap-2 items-center">
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 border border-border rounded px-3 py-2 text-foreground font-sans"
            onChangeText={setSlug}
            placeholder="film slug"
            value={slug}
          />
          <Button
            label="Load"
            onPress={() => setUri(`${LETTERBOXD_BASE_URL}/film/${slug}/`)}
            size="sm"
            variant="outline"
          />
        </View>
      </View>

      {/* Half the screen, because both halves matter at once: you need to see
          the control you are pressing *and* what it emitted. */}
      <View className="flex-1 border-y border-border">
        <NitroWebView
          onLoadEnd={callback(() => {
            // Re-injected on every load: a navigation replaces `window`, and a
            // once-only hook would quietly stop capturing exactly when you
            // click through to the film page where the control lives.
            void webView?.evaluateJavaScript(buildCaptureScript());
          })}
          onMessage={callback((event) => {
            const capture = parseCaptureMessage(event.nativeEvent.data);
            if (capture != null) setCaptures((prior) => [...prior, capture]);
          })}
          source={{ uri }}
          style={{ flex: 1 }}
          hybridRef={callback((ref) => setWebView(ref))}
        />
      </View>

      <View className="flex-row gap-2 px-4 py-2">
        <Button
          label={`Clear (${captures.length})`}
          onPress={() => setCaptures([])}
          size="sm"
          variant="quiet"
        />
        <Button
          label="Print report"
          // Console, not a share sheet: the deliverable is a file in
          // `docs/solutions/`, and the Metro log is already open next to the
          // editor it gets pasted into.
          onPress={() => console.log(captureReport(captures))}
          size="sm"
          variant="outline"
        />
      </View>

      <ScrollView className="max-h-28 px-4" contentContainerClassName="pb-8 gap-3">
        {captures.map((capture, index) => (
          <View className="border border-border rounded p-3" key={index}>
            <Text className="text-foreground font-sans-semibold text-sm">
              {capture.method} {capture.url}
            </Text>
            <Text className="text-muted font-sans text-xs mt-1">
              {capture.status} · {capture.via}
            </Text>
            {capture.body != null && (
              <Text className="text-muted font-sans text-xs mt-2">
                body: {capture.body.slice(0, 400)}
              </Text>
            )}
            <Text className="text-muted font-sans text-xs mt-2">
              → {capture.responseBody.slice(0, 400)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
