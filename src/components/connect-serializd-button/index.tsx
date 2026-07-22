import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { Effect } from 'effect';
import { z } from 'zod';

import { PresstableOpacity } from '@/components/presstable';
import { loginToSerializd, validateAuthToken } from '@/lib/providers/serializd';
import { serializdDeps } from '@/state/queries/serializd';
import { connectSerializd } from '@/state/session/serializd';

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your Serializd email.'),
  password: z.string().min(1, 'Enter your password.'),
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

/**
 * Web Serializd connect (plan 0017 R5): an email/password form that posts to
 * `/login` through the same-origin proxy, exchanging the password for a bearer
 * token. The password is used only for the exchange and never persisted — only
 * `{ accessToken, username }` is stored. Works on web (no `EXPO_OS` gate, R13)
 * because the proxy carries the request browser → same-origin → Serializd
 * without a CORS error. The credential trust boundary is documented as a risk
 * (plan 0017); the WebView path (mobile) is the primary, password-free connect.
 */
export function ConnectSerializdButton() {
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const muted = useCSSVariable('--color-muted');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CredentialsForm>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(credentialsSchema),
  });

  const submit = handleSubmit(async (values) => {
    setStatus('submitting');
    setErrorMessage(null);
    const deps = serializdDeps();
    const login = await Effect.runPromise(
      Effect.either(
        loginToSerializd(deps, { email: values.email.trim(), password: values.password }),
      ),
    );
    if (login._tag === 'Left') {
      // Surface the API's own message (wrong password, etc.); store nothing.
      setErrorMessage(loginErrorText(login.left.message));
      setStatus('idle');
      return;
    }

    // Some login responses omit the username — recover it from the token.
    let username = login.right.username;
    if (username === '') {
      const validated = await Effect.runPromise(
        Effect.either(validateAuthToken(deps, login.right.token)),
      );
      if (validated._tag === 'Right') username = validated.right.username;
    }

    connectSerializd({ accessToken: login.right.token, username });
    setStatus('idle');
  });

  return (
    <View className="w-full gap-3">
      <Text className="text-muted font-sans text-sm">
        Sign in with your Serializd email and password. Shinobu exchanges them for
        an access token and keeps only the token — your password is never stored.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
            keyboardType="email-address"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            placeholder="Serializd email"
            placeholderTextColor={typeof muted === 'string' ? muted : undefined}
            value={field.value}
          />
        )}
      />
      {errors.email != null && (
        <Text className="text-accent font-sans text-xs">{errors.email.message}</Text>
      )}
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            onSubmitEditing={() => submit()}
            placeholder="Password"
            placeholderTextColor={typeof muted === 'string' ? muted : undefined}
            returnKeyType="done"
            secureTextEntry
            value={field.value}
          />
        )}
      />
      {errors.password != null && (
        <Text className="text-accent font-sans text-xs">{errors.password.message}</Text>
      )}
      {errorMessage != null && (
        <Text className="text-accent font-sans text-xs">{errorMessage}</Text>
      )}
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded"
        disabled={status === 'submitting'}
        onPress={() => submit()}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base text-center">
          {status === 'submitting' ? 'Connecting…' : 'Connect Serializd'}
        </Text>
      </PresstableOpacity>
    </View>
  );
}

/** Strip the diagnostic `serializd: ` provider prefix for user-facing display. */
function loginErrorText(message: string): string {
  return message.replace(/^serializd:\s*/i, '');
}
