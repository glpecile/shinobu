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
  TextInput,
  View,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Collapsible } from '@/components/collapsible';
import { PresstableOpacity } from '@/components/presstable';
import { Steps } from '@/components/steps';
import { TRAKT_CREATE_APP_URL } from '@/lib/providers/external-urls';
import { TRAKT_AUTHORIZE_URL } from '@/lib/providers/trakt/config';
import {
  getTraktRedirectUri,
  TRAKT_CORS_ORIGINS,
  TRAKT_REDIRECT_URIS,
} from '@/lib/providers/trakt/redirect-uri';
import { exchangeTraktCode } from '@/state/queries/trakt';
import { useProviderCredentials } from '@/state/session/use-provider-credentials';

const discovery = {
  authorizationEndpoint: TRAKT_AUTHORIZE_URL,
  tokenEndpoint: 'https://api.trakt.tv/oauth/token',
};

type ConnectionStatus = 'idle' | 'connecting' | 'error';

// Trakt's client id and secret are both 64-char hex strings. The check can't
// tell the two apart (same shape), but it does catch the common paste
// mistakes: URLs, app names, partial selections.
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

/** Selectable value the user copies into a field of Trakt's application form. */
function CopyValue({ value, hint }: { value: string; hint?: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="border border-border bg-surface px-2 py-1 rounded">
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
  const muted = useCSSVariable('--color-muted');
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          className="border border-border bg-surface text-foreground px-4 py-3 rounded font-sans"
          onBlur={field.onBlur}
          onChangeText={field.onChange}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={typeof muted === 'string' ? muted : undefined}
          returnKeyType="done"
          value={field.value}
        />
      )}
    />
  );
}

/**
 * Trakt OAuth trigger. The API app credentials (client id + secret — the
 * token exchange needs both) are entered in-app, no env-file edits. On
 * native, auth opens in an embedded browser session via expo-web-browser and
 * returns to the app, and this component finishes the code exchange. On web,
 * the current window navigates to Trakt and is redirected back to the home
 * route with ?code=..., where `useOAuthCallback` exchanges it.
 */
export function ConnectTraktButton() {
  const [credentials, saveCredentials, clearCredentials] =
    useProviderCredentials('trakt');
  const [status, setStatus] = useState<ConnectionStatus>('idle');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CredentialsForm>({
    defaultValues: {
      clientId: credentials?.clientId ?? '',
      clientSecret: credentials?.clientSecret ?? '',
    },
    resolver: zodResolver(credentialsSchema),
  });
  // Saving the credentials means the user wants to connect — go straight into
  // the OAuth flow instead of asking for an extra tap on Connect.
  const submitCredentials = handleSubmit(async (values) => {
    saveCredentials(values);
    await connect(values.clientId);
  });

  const clientId = credentials?.clientId ?? '';
  const redirectUri = getTraktRedirectUri();

  async function connect(id: string = clientId) {
    if (id === '') return;

    setStatus('connecting');
    // Built on demand (rather than via useAuthRequest) so just-saved
    // credentials can connect immediately, without waiting for a re-render.
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
      // On web the most reliable flow is a same-window redirect: Trakt sends
      // the user back to the home route with ?code=..., where
      // useOAuthCallback exchanges it. This avoids popup blockers and
      // orphaned auth windows.
      window.location.assign(request.url);
      return;
    }

    const result = await openAuthSessionAsync(request.url, redirectUri);
    if (result.type !== 'success') {
      // User-cancelled/dismissed — not an error worth alarming about.
      setStatus('idle');
      return;
    }

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (code == null) {
      // Trakt redirected back without a code (?error=...): a real failure.
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

  if (credentials == null) {
    // If web dev runs on a non-default port the device URI won't be in the
    // canonical list — surface it so the user registers the one that matters.
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
        <PresstableOpacity
          className="bg-accent px-5 py-3 rounded"
          onPress={() => submitCredentials()}
        >
          <Text className="text-accent-foreground font-sans-semibold text-base text-center">
            Save & Connect
          </Text>
        </PresstableOpacity>
      </View>
    );
  }

  return (
    <View className="items-center gap-3">
      {status === 'connecting' && (
        <Text className="text-muted font-sans text-sm">
          Connecting to Trakt…
        </Text>
      )}
      {status === 'error' && (
        <Text className="text-accent font-sans text-sm text-center">
          Could not connect. Tap Connect to try again.
        </Text>
      )}
      <PresstableOpacity
        className="bg-accent px-5 py-3 rounded"
        disabled={status === 'connecting'}
        onPress={() => connect()}
      >
        <Text className="text-accent-foreground font-sans-semibold text-base">
          {status === 'connecting' ? 'Connecting…' : 'Connect Trakt'}
        </Text>
      </PresstableOpacity>
      <PresstableOpacity onPress={() => clearCredentials()}>
        <Text className="text-muted font-sans text-xs">Edit API credentials</Text>
      </PresstableOpacity>
    </View>
  );
}
