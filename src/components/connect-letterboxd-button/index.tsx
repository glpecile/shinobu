import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Button } from '@/components/button';
import { validateLetterboxdUsername } from '@/state/queries/letterboxd';
import { connectLetterboxd } from '@/state/session/letterboxd';

type ConnectionStatus = 'idle' | 'checking' | 'not-found' | 'error';

// Letterboxd usernames are URL path segments — letters, digits, underscores,
// hyphens. Catch pasted profile URLs and @-handles rather than a strict spec.
const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Enter your Letterboxd username first.')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Just the username — no URL or @, only letters, numbers, - and _.',
    ),
});

type UsernameForm = z.infer<typeof usernameSchema>;

/**
 * Web Letterboxd connect: read-only, a public username (plan 0012 decision 1).
 * There's no OAuth and no write path on web — logging needs a signed-in web
 * session, which only the native sign-in WebView can capture (index.native.tsx).
 * Reads and the validation fetch below run through the same-origin Worker
 * proxy (plan 0018), so the username is validated against the live RSS feed
 * before saving, same as native.
 */
export function ConnectLetterboxdButton() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const muted = useCSSVariable('--color-muted');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<UsernameForm>({
    defaultValues: { username: '' },
    resolver: zodResolver(usernameSchema),
  });

  const submit = handleSubmit(async (values) => {
    const username = values.username.trim();
    setStatus('checking');
    try {
      const exists = await validateLetterboxdUsername(username);
      if (!exists) {
        setStatus('not-found');
        return;
      }
      connectLetterboxd(username);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  });

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        On the web, Shinobu reads your public Letterboxd profile — your watchlist
        shows up in the feed. Logging movies to Letterboxd happens in the mobile
        app, where you sign in securely and your session stays on your device.
      </Text>
      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="border border-border bg-surface text-foreground px-4 py-3 rounded-md font-sans"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => submit()}
            placeholder="Letterboxd username"
            placeholderTextColor={typeof muted === 'string' ? muted : undefined}
            returnKeyType="done"
            value={field.value}
          />
        )}
      />
      {errors.username != null && (
        <Text className="text-accent font-sans text-xs">
          {errors.username.message}
        </Text>
      )}
      {status === 'not-found' && (
        <Text className="text-accent font-sans text-xs">
          No Letterboxd member with that username — check the spelling.
        </Text>
      )}
      {status === 'error' && (
        <Text className="text-accent font-sans text-xs">
          Could not reach Letterboxd. Try again.
        </Text>
      )}
      <Button
        label="Connect Letterboxd"
        loading={status === 'checking'}
        loadingLabel="Checking…"
        onPress={() => void submit()}
      />
    </View>
  );
}
