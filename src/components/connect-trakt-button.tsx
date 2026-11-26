import { zodResolver } from '@hookform/resolvers/zod';
import { loadAsync, ResponseType } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import {
  Linking,
  Platform,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { Steps } from '@/components/steps';
import { TextField } from '@/components/text-field';
import { TRAKT_CREATE_APP_URL } from '@/lib/providers/external-urls';
import { TRAKT_AUTHORIZE_URL } from '@/lib/providers/trakt/config';
import {
  getTraktRedirectUri,
  TRAKT_CORS_ORIGINS,
  TRAKT_REDIRECT_URIS,
} from '@/lib/providers/trakt/redirect-uri';
import { Provider } from '@/lib/providers/types';
import { exchangeTraktCode } from '@/state/queries/trakt';
import { beginOAuthFlow } from '@/state/session/oauth-flow';
import { useProviderCredentials } from '@/state/session/use-provider-credentials';

const discovery = {
  authorizationEndpoint: TRAKT_AUTHORIZE_URL,
  tokenEndpoint: 'https://api.trakt.tv/oauth/token',
};

type ConnectionStatus = 'idle' | 'connecting' | 'error';

const hex64 = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Paste your ${label} first.`)
    .regex(
      /^[0-9a-f]{64}$/i,
      `That doesn't look like a ${label} — it's a 64-character hex string on your Trakt app's page.`,
    );

const credentialsSchema = z.object({
  clientId: hex64('Client ID'),
  clientSecret: hex64('Client Secret'),
});

type CredentialsForm = z.infer<typeof credentialsSchema>;

function CopyValue({ value, hint }: { value: string; hint?: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="border border-border bg-surface px-2 py-1 rounded-md">
        <Text className="text-foreground font-sans text-xs" selectable>
          {value}
        </Text>
      </View>
      {hint != null && (
        <Text className="text-muted font-sans text-xs">{hint}</Text>
      )}
    </View>
  );
}

function CredentialInput({
  control,
  name,
  placeholder,
  onSubmit,
}: {
  control: Control<CredentialsForm>;
  name: keyof CredentialsForm;
  placeholder: string;
  onSubmit: () => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          onBlur={field.onBlur}
          onChangeText={field.onChange}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          returnKeyType="done"
          value={field.value}
        />
      )}
    />
  );
}

export function useTraktConnect() {
  const [credentials, saveCredentials, clearCredentials] =
    useProviderCredentials(Provider.Trakt);
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const clientId = credentials?.clientId ?? '';
  const redirectUri = getTraktRedirectUri();

  async function connect(id: string = clientId) {
    if (id === '') return;

    setStatus('connecting');
    let request;
    try {
      request = await loadAsync(
        {
          clientId: id,
          responseType: ResponseType.Code,
          redirectUri,
          // Trakt does not support PKCE; including code_challenge causes the
          // authorization endpoint to reject the request.
          usePKCE: false,
        },
        discovery,
      );
    } catch (error) {
      setStatus('error');
      console.error('Trakt auth request could not be built', error);
      return;
    }
    if (request.url == null) {
      setStatus('error');
      return;
    }

    if (Platform.OS === 'web') {
      beginOAuthFlow(Provider.Trakt, request.state);
      window.location.assign(request.url);
      return;
    }

    const result = await openAuthSessionAsync(request.url, redirectUri);
    if (result.type !== 'success') {
      setStatus('idle');
      return;
    }

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (code == null) {
      setStatus('error');
      return;
    }

    exchangeTraktCode({ code, redirectUri })
      .then(() => setStatus('idle'))
      .catch((error) => {
        setStatus('error');
        console.error('Trakt OAuth exchange failed', error);
      });
  }

  return {
    connect,
    status,
    credentials,
    saveCredentials,
    clearCredentials,
    clientId,
    redirectUri,
    needsSetup: credentials == null,
  };
}

export function ConnectTraktButton() {
  const {
    connect,
    status,
    credentials,
    saveCredentials,
    clearCredentials,
    redirectUri,
  } = useTraktConnect();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CredentialsForm>({
    defaultValues: {
      clientId: credentials?.clientId ?? '',
      clientSecret: credentials?.clientSecret ?? '',
    },
    resolver: zodResolver(credentialsSchema),
  });
  const submitCredentials = handleSubmit(async (values) => {
    saveCredentials(values);
    await connect(values.clientId);
  });

  if (credentials == null) {
    const redirectUris = TRAKT_REDIRECT_URIS.includes(redirectUri)
      ? TRAKT_REDIRECT_URIS
      : [...TRAKT_REDIRECT_URIS, redirectUri];

    return (
      <View className="w-full gap-4">
        <Text className="text-muted font-sans text-sm">
          Shinobu talks to Trakt through your own (free) Trakt API app —
          one-time setup, about a minute.
        </Text>

        <Collapsible label="How to create the Trakt app">
          <Steps>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Create an app at{" "}
                <Text
                  className="text-accent font-sans-semibold underline"
                  onPress={() => Linking.openURL(TRAKT_CREATE_APP_URL)}
                >
                  {TRAKT_CREATE_APP_URL.replace("https://", "")}
                </Text>
                . Name and description can be anything (e.g. "Shinobu").
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                In <Text className="text-foreground font-sans-semibold">Redirect
                uri</Text>, paste all of these (one per line) so the same app
                works on every device:
              </Text>
              {redirectUris.map((uri) => (
                <CopyValue
                  hint={uri === redirectUri ? "← this device" : undefined}
                  key={uri}
                  value={uri}
                />
              ))}
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                In <Text className="text-foreground font-sans-semibold">
                Javascript (cors) origins</Text> (needed for the web app):
              </Text>
              {TRAKT_CORS_ORIGINS.map((origin) => (
                <CopyValue key={origin} value={origin} />
              ))}
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Under <Text className="text-foreground font-sans-semibold">
                Permissions</Text>, tick{" "}
                <Text className="text-foreground font-sans-semibold">
                  /scrobble
                </Text>
                {" "}(required for logging watches).{" "}
                <Text className="text-foreground font-sans-semibold">
                  /checkin
                </Text>
                {" "}is optional.
              </Text>
            </Steps.Item>

            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Save the app, then copy its{" "}
                <Text className="text-foreground font-sans-semibold">
                  Client ID
                </Text>
                {" "}and{" "}
                <Text className="text-foreground font-sans-semibold">
                  Client Secret
                </Text>
                {" "}— connecting needs both — and paste them below.
              </Text>
            </Steps.Item>
          </Steps>
        </Collapsible>

        <CredentialInput
          control={control}
          name="clientId"
          onSubmit={() => submitCredentials()}
          placeholder="Trakt Client ID"
        />
        {errors.clientId != null && (
          <Text className="text-accent font-sans text-xs">
            {errors.clientId.message}
          </Text>
        )}
        <CredentialInput
          control={control}
          name="clientSecret"
          onSubmit={() => submitCredentials()}
          placeholder="Trakt Client Secret"
        />
        {errors.clientSecret != null && (
          <Text className="text-accent font-sans text-xs">
            {errors.clientSecret.message}
          </Text>
        )}
        <Button
          icon={<Button.Icon name="link-outline" />}
          label="Save & Connect"
          loading={isSubmitting || status === 'connecting'}
          loadingLabel="Connecting…"
          onPress={() => void submitCredentials()}
        />
      </View>
    );
  }

  return (
    <View className="items-center gap-3">
      {status === 'error' && (
        <Text className="text-accent font-sans text-sm text-center">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <Button
        icon={<Button.Icon name="link-outline" />}
        label="Connect Trakt"
        loading={status === 'connecting'}
        loadingLabel="Connecting…"
        onPress={() => void connect()}
      />
      <Button
        icon={<Button.Icon name="create-outline" />}
        label="Edit API credentials"
        onPress={() => clearCredentials()}
        size="sm"
        variant="ghost"
      />
    </View>
  );
}
