import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Switch, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CenteredNotice } from '@/components/centered-notice';
import { GroupedList } from '@/components/grouped-list';
import Head from '@/components/head';
import { KeyboardAwareScrollView } from '@/components/keyboard-aware-scroll-view';
import { List } from '@/components/List';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { Sheet } from '@/components/sheet';
import { SmallPoster } from '@/components/small-poster';
import { TextField } from '@/components/text-field';
import { TagPicker } from '@/features/log-media/tag-picker';
import { haptics } from '@/lib/haptics';
import { installLetterboxdScript } from '@/lib/install-letterboxd-script';
import { usePushRoute } from '@/lib/navigation';
import { openExternalUrl } from '@/lib/open-external-url';
import type { LetterboxdListSharing } from '@/lib/providers/letterboxd/deps';
import { letterboxdListUrl } from '@/lib/providers/letterboxd/lists';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';
import { PROVIDERS } from '@/lib/providers/registry';
import { routes } from '@/lib/routes';
import { useThemeColor } from '@/lib/theme-color';
import { toast } from '@/lib/toast';
import { useCreateList, type NewList } from '@/state/queries/list-membership';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';
import type { NormalizedMediaItem } from '@/types/media';
import { ListsHeader } from './list-header';
import { ListSearch } from './list-membership-form';
import { fitsProvider, newListSchema, type ListProvider, type NewListForm as NewListFormValues } from './new-list-schema';

export type { ListProvider };

/** Where each provider's own editor lives: the recovery when Shinobu can't save. */
const EDITOR_URL: Record<ListProvider, string> = {
  letterboxd: 'https://letterboxd.com/list/new/',
  serializd: 'https://www.serializd.com/list/create',
};

const SHARING_OPTIONS: readonly { value: LetterboxdListSharing; label: string }[] = [
  { value: 'Public', label: 'Public' },
  { value: 'Anyone', label: 'Link' },
  { value: 'Friends', label: 'Friends' },
  { value: 'You', label: 'Private' },
];

/** Letterboxd's own descriptions, from its editor's `sharePolicyDetails`. */
const SHARING_NOTE: Record<LetterboxdListSharing, string> = {
  Public: 'Anyone, and it appears on your profile.',
  Anyone: 'Anyone with the share link.',
  Friends: 'Friends (people you follow) with the share link.',
  You: 'Only you.',
};

function FieldError({ children }: { children: ReactNode }) {
  return <Text className="text-accent font-sans text-xs" role="alert">{children}</Text>;
}

function Field({ label, note, error, children }: { label: string; note?: string; error?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-foreground font-sans-semibold text-sm">{label}</Text>
      {children}
      {error != null ? <FieldError>{error}</FieldError> : note != null && <Text className="text-muted font-sans text-xs">{note}</Text>}
    </View>
  );
}

function SwitchRow({ label, note, value, onChange, disabled }: { label: string; note: string; value: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  const accent = useThemeColor('--color-accent');
  const border = useThemeColor('--color-border');
  return (
    <View className="flex-row items-center gap-4">
      <View className="flex-1 min-w-0">
        <Text className="text-foreground font-sans-semibold text-sm">{label}</Text>
        <Text className="text-muted font-sans text-xs mt-0.5">{note}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={(next) => { haptics.selection(); onChange(next); }}
        thumbColor={process.env.EXPO_OS === 'android' ? (value ? accent : undefined) : undefined}
        trackColor={{ false: border, true: accent }}
        value={value}
      />
    </View>
  );
}

/**
 * Letterboxd's list editor, for whichever list provider is connected: details,
 * who sees it, ranking, and the first titles. `newListSchema` holds the rules;
 * errors appear on submit and then follow each edit. A list only Letterboxd can
 * show (anything but Public) ends on a confirmation instead of a page Shinobu
 * can't read.
 */
export function NewListForm({ providers, initialProvider }: {
  /** Connected list providers and their accounts, at least one. */
  providers: readonly { provider: ListProvider; username: string }[];
  initialProvider: ListProvider;
}) {
  const router = useRouter();
  const { control, handleSubmit, getValues, setValue, formState: { errors, isSubmitted } } = useForm<NewListFormValues, unknown, NewList>({
    // Every pick stays across a provider switch; each provider takes what fits it.
    defaultValues: { provider: initialProvider, name: '', description: '', tags: 'shinobu, ', sharing: 'Public', isPrivate: false, ranked: false, allowsComments: false, items: [] },
    resolver: zodResolver(newListSchema),
  });
  const [provider, sharing, isPrivate, ranked, name, picked] = useWatch({ control, name: ['provider', 'sharing', 'isPrivate', 'ranked', 'name', 'items'] });
  const [searching, setSearching] = useState(false);
  const [unlisted, setUnlisted] = useState<{ name: string; url: string } | null>(null);
  const username = providers.find((entry) => entry.provider === provider)!.username;
  const mutation = useCreateList(username);
  const hasLetterboxdSession = useHasLetterboxdWriteSession();
  const hasLetterboxdScript = useLetterboxdUserscript('list-create');
  const label = PROVIDERS[provider].label;
  const noun = provider === 'letterboxd' ? 'film' : 'show';
  const items = picked.filter((item) => fitsProvider(provider, item));
  const needsScript = process.env.EXPO_OS === 'web' && provider === 'letterboxd' && !hasLetterboxdScript;
  const writable = provider === 'serializd' || (process.env.EXPO_OS === 'web' ? hasLetterboxdScript : hasLetterboxdSession);
  const busy = mutation.isPending;

  // Read through getValues: recycled search rows can hold an older render's callback.
  function setItems(next: (current: NormalizedMediaItem[]) => NormalizedMediaItem[]) {
    setValue('items', next(getValues('items')), { shouldValidate: isSubmitted });
  }

  if (unlisted != null) {
    return (
      <>
      <ListsHeader provider="letterboxd" title="New list" />
      <CenteredNotice>
        <CenteredNotice.Icon name="checkmark-circle-outline" />
        <CenteredNotice.Title>List created</CenteredNotice.Title>
        <CenteredNotice.Body>{`"${unlisted.name}" isn’t public, so it opens on Letterboxd rather than here.`}</CenteredNotice.Body>
        <View className="mt-6 items-center gap-3">
          <Button icon={<Button.Icon name="open-outline" />} label="View on Letterboxd" onPress={() => void openExternalUrl(unlisted.url)} />
          <Button icon={<Button.Icon name="checkmark" />} label="Done" onPress={() => router.canGoBack() ? router.back() : router.replace(routes.letterboxdLists('created'))} variant="quiet" />
        </View>
      </CenteredNotice>
      </>
    );
  }

  const create = handleSubmit((list) => {
    haptics.confirm();
    mutation.mutate(list, {
      onSuccess: (result) => {
        toast.success('List created', list.draft.name);
        switch (result.provider) {
          case 'letterboxd':
            if (list.provider === 'letterboxd' && list.draft.sharing !== 'Public') {
              setUnlisted({ name: list.draft.name, url: letterboxdListUrl(result.owner, result.slug) ?? `https://letterboxd.com/${result.owner}/lists/` });
              return;
            }
            router.replace(routes.letterboxdList(result.owner, result.slug));
            return;
          case 'serializd':
            router.replace(routes.serializdList(result.id));
        }
      },
      onError: () => haptics.error(),
    });
  }, () => haptics.error());

  return (
    <>
      <ListsHeader provider={provider} title="New list" />
      <KeyboardAwareScrollView className="flex-1" contentContainerClassName="w-full max-w-2xl self-center px-6 pb-12 gap-6" keyboardShouldPersistTaps="handled">
        {providers.length > 1 && (
          <Controller control={control} name="provider" render={({ field }) => (
            <NativeSegmentedControl
              accessibilityLabel="Save to"
              className="w-full max-w-72 self-center"
              onChange={(next) => { if (busy) return; field.onChange(next); router.setParams({ provider: next }); }}
              options={providers.map((entry) => ({ value: entry.provider, label: PROVIDERS[entry.provider].label }))}
              size="sm"
              value={field.value}
            />
          )} />
        )}
        <Field error={errors.name?.message} label="Name">
          <Controller control={control} name="name" render={({ field }) => (
            <TextField accessibilityLabel="Name" autoCapitalize="sentences" autoCorrect editable={!busy} onBlur={field.onBlur} onChangeText={field.onChange} placeholder={provider === 'letterboxd' ? 'e.g. Best of the decade' : 'e.g. Comfort rewatches'} returnKeyType="next" value={field.value} />
          )} />
        </Field>
        <Field error={errors.description?.message} label="Description">
          <Controller control={control} name="description" render={({ field }) => (
            <TextField accessibilityLabel="Description" autoCapitalize="sentences" autoCorrect editable={!busy} multiline onBlur={field.onBlur} onChangeText={field.onChange} placeholder="What ties it together?" value={field.value} />
          )} />
        </Field>
        {provider === 'letterboxd' && (
          <Field error={errors.tags?.message} label="Tags">
            <Controller control={control} name="tags" render={({ field }) => (
              <>
                <TextField accessibilityLabel="Tags" editable={!busy} onBlur={field.onBlur} onChangeText={field.onChange} placeholder="tags, comma separated" value={field.value} />
                <TagPicker onChange={field.onChange} value={field.value} />
              </>
            )} />
          </Field>
        )}
        <Field label="Who can see it" note={provider === 'letterboxd' ? SHARING_NOTE[sharing] : isPrivate ? 'Only you can see it.' : 'Anyone can find it on your profile.'}>
          {provider === 'letterboxd'
            ? <Controller control={control} name="sharing" render={({ field }) => <NativeSegmentedControl accessibilityLabel="Who can see it" className="max-w-md" onChange={field.onChange} options={SHARING_OPTIONS} size="sm" value={field.value} />} />
            : <Controller control={control} name="isPrivate" render={({ field }) => <NativeSegmentedControl accessibilityLabel="Who can see it" className="max-w-72" onChange={(value) => field.onChange(value === 'private')} options={[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }]} size="sm" value={field.value ? 'private' : 'public'} />} />}
        </Field>
        <GroupedList>
          <GroupedList.Item>
            <Controller control={control} name="ranked" render={({ field }) => <SwitchRow disabled={busy} label="Ranked" note={`Number each ${noun} by its position.`} onChange={field.onChange} value={field.value} />} />
          </GroupedList.Item>
          {provider === 'serializd' && (
            <GroupedList.Item>
              <Controller control={control} name="allowsComments" render={({ field }) => <SwitchRow disabled={busy} label="Comments" note="Let others comment on the list." onChange={field.onChange} value={field.value} />} />
            </GroupedList.Item>
          )}
        </GroupedList>
        <View className="gap-3">
          <View className="flex-row items-center gap-3">
            <Text className="text-foreground font-display text-lg flex-1">{provider === 'letterboxd' ? 'Films' : 'Shows'}{items.length > 0 && <Text className="text-muted font-sans text-sm">{`  ${items.length}`}</Text>}</Text>
            <Button disabled={busy} icon={<Button.Icon name="add" />} label={`Add ${noun}s`} onPress={() => setSearching(true)} size="sm" variant="quiet" />
          </View>
          {items.length === 0 ? (
            <Text className="text-muted font-sans text-sm">{provider === 'letterboxd' ? 'Optional. Add films now or from the list later.' : 'Add the first show to start the list.'}</Text>
          ) : (
            <List
              data={items}
              estimatedItemSize={70}
              extraData={ranked}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <View className="flex-row items-center gap-3 py-1.5">
                  {ranked && <Text className="text-muted font-display text-base w-6 text-right">{index + 1}</Text>}
                  <SmallPoster recyclingKey={item.id} size="sm" uri={item.coverImage} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground font-sans-semibold text-sm" numberOfLines={1}>{item.title}</Text>
                    {item.year != null && <Text className="text-muted font-sans text-xs mt-0.5">{item.year}</Text>}
                  </View>
                  <Button disabled={busy} icon={<Button.Icon name="close" />} iconOnly label={`Remove ${item.title}`} onPress={() => { haptics.selection(); setItems((current) => current.filter((entry) => entry.id !== item.id)); }} size="sm" variant="ghost" />
                </View>
              )}
            />
          )}
          {errors.items?.message != null && <FieldError>{errors.items.message}</FieldError>}
        </View>
        <View className="gap-3">
          {!writable && <Text className="text-muted font-sans text-sm">{needsScript ? 'Install or update the Letterboxd script, then reload this tab to create lists here.' : 'Reconnect Letterboxd with a signed-in session to create lists here.'}</Text>}
          {mutation.isError && <Text className="text-accent font-sans text-sm" role="alert">{mutation.error.message}</Text>}
          {needsScript && <Button icon={<Button.Icon name="open-outline" />} label="Install Letterboxd script" onPress={installLetterboxdScript} />}
          {writable && <Button
            icon={<Button.Icon name="add" />}
            label={mutation.isError ? 'Try again' : 'Create list'}
            loading={busy}
            loadingLabel="Creating…"
            onPress={() => void create()}
          />}
          {(!writable || mutation.isError) && (
            <Button icon={<Button.Icon name="open-outline" />} label={`Create on ${label}`} onPress={() => void openExternalUrl(EDITOR_URL[provider])} variant="quiet" />
          )}
        </View>
      </KeyboardAwareScrollView>
      <Sheet onClose={() => setSearching(false)} open={searching}>
        {searching && (
          <ListSearch
            items={items}
            onClose={() => setSearching(false)}
            onSelect={(item) => setItems((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item])}
            target={{ provider, title: name.trim() || 'New list', url: EDITOR_URL[provider] }}
          />
        )}
      </Sheet>
    </>
  );
}

/** The editor's frame: header and document title over the form, or a way to connect. */
export function NewListScreen({ providers, initialProvider }: { providers: readonly { provider: ListProvider; username: string }[]; initialProvider: ListProvider | null }) {
  const pushRoute = usePushRoute();
  const first = providers[0];
  return (
    <View className="flex-1 bg-background">
      <Head><title>New list — Shinobu</title></Head>
      {first == null ? (
        <>
        <ListsHeader provider={initialProvider ?? 'letterboxd'} title="New list" />
        <CenteredNotice>
          <CenteredNotice.Icon name="list-outline" />
          <CenteredNotice.Title>Connect a list provider</CenteredNotice.Title>
          <CenteredNotice.Body>Connect Letterboxd for film lists or Serializd for show lists.</CenteredNotice.Body>
          <CenteredNotice.Action icon={<Button.Icon name="link-outline" />} label="Open settings" onPress={() => pushRoute(routes.settings)} />
        </CenteredNotice>
        </>
      ) : (
        <NewListForm initialProvider={providers.some((entry) => entry.provider === initialProvider) ? initialProvider! : first.provider} providers={providers} />
      )}
    </View>
  );
}
