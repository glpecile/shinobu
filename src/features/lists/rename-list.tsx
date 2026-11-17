import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { Tooltip } from '@/components/tooltip';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { installLetterboxdScript, letterboxdScriptHint } from '@/lib/install-letterboxd-script';
import { openExternalUrl } from '@/lib/open-external-url';
import { useLetterboxdUserscript, useLetterboxdUserscriptUntrusted } from '@/lib/providers/letterboxd/userscript-bridge';
import { PROVIDERS } from '@/lib/providers/registry';
import { Provider } from '@/lib/providers/types';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import { useRenameList, type ListEditTarget } from '@/state/queries/list-membership';
import { useHasLetterboxdWriteSession } from '@/state/session/letterboxd';
import { ToolbarIcon } from './list-header';

function RenameForm({ target, description: saved, onDone }: { target: ListEditTarget; description: string | undefined; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(target.title);
  const [description, setDescription] = useState(saved ?? '');
  const mutation = useRenameList(target);
  const hasSession = useHasLetterboxdWriteSession();
  const hasScript = useLetterboxdUserscript('list-rename');
  const scriptUntrusted = useLetterboxdUserscriptUntrusted();
  const needsScript = process.env.EXPO_OS === 'web' && target.provider === Provider.Letterboxd && !hasScript;
  const writable = target.provider !== Provider.Letterboxd || (process.env.EXPO_OS === 'web' ? hasScript : hasSession);
  const unchanged = name.trim() === '' || (name.trim() === target.title && (saved == null || description.trim() === saved.trim()));
  function save() {
    haptics.confirm();
    mutation.mutate(saved == null ? { name } : { name, description: description.trim() }, {
      onSuccess: (result) => {
        toast.success(saved == null ? 'List renamed' : 'List saved', name.trim());
        onDone();
        // Letterboxd may give a renamed list a new address; the old one only redirects.
        if (result.provider === Provider.Letterboxd && target.provider === Provider.Letterboxd && result.slug !== target.slug) router.replace(routes.letterboxdList(result.owner, result.slug));
      },
      onError: () => haptics.error(),
    });
  }
  return (
    <WriteSheet.Step>
      <WriteSheet.Header><WriteSheet.Title>{saved == null ? 'Rename list' : 'Edit list'}</WriteSheet.Title></WriteSheet.Header>
      <View className="mt-5 gap-3">
        <TextField accessibilityLabel="Name" autoCapitalize="sentences" autoCorrect autoFocus editable={!mutation.isPending} onChangeText={setName} onSubmitEditing={() => { if (writable && !unchanged) save(); }} returnKeyType="done" value={name} />
        {saved != null && <TextField accessibilityLabel="Description" autoCapitalize="sentences" autoCorrect editable={!mutation.isPending} multiline onChangeText={setDescription} placeholder="What ties it together?" value={description} />}
      </View>
      {!writable && <WriteSheet.Description>{needsScript ? letterboxdScriptHint(scriptUntrusted, 'rename lists here') : 'Reconnect Letterboxd with a signed-in session to rename lists here.'}</WriteSheet.Description>}
      {mutation.isError && <WriteSheet.Error>{mutation.error.message}</WriteSheet.Error>}
      <WriteSheet.Actions>
        {needsScript && !scriptUntrusted && <Button icon={<Button.Icon name="open-outline" />} label="Install Letterboxd script" onPress={installLetterboxdScript} />}
        {writable && <Button disabled={unchanged} icon={<Button.Icon name="checkmark" />} label={mutation.isError ? 'Try again' : saved == null ? 'Save name' : 'Save list'} loading={mutation.isPending} loadingLabel="Saving…" onPress={save} />}
        {(!writable || mutation.isError) && <Button icon={<Button.Icon name="open-outline" />} label={`Open on ${PROVIDERS[target.provider].label}`} onPress={() => void openExternalUrl(target.url)} variant="quiet" />}
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

/**
 * The owner's rename control for a list's toolbar, and the sheet it opens. Icon-only on a phone, where the toolbar can't fit its label.
 * Pass a Hardcover list's `description` to edit it beside the name; other providers save only the name.
 */
export function RenameList({ target, description }: { target: ListEditTarget; description?: string }) {
  const [open, setOpen] = useState(false);
  const compact = useWindowDimensions().width < 640;
  const editable = target.provider === Provider.Hardcover ? description : undefined;
  const label = editable == null ? 'Rename' : 'Edit';
  return (
    <>
      {compact
        ? <ToolbarIcon><Tooltip label={`${label} list`}><Button icon={<Button.Icon name="create-outline" />} iconOnly label={`${label} list`} onPress={() => setOpen(true)} size="sm" variant="quiet" /></Tooltip></ToolbarIcon>
        : <Button icon={<Button.Icon name="create-outline" />} label={label} onPress={() => setOpen(true)} size="sm" variant="quiet" />}
      <Sheet autoFocus onClose={() => setOpen(false)} open={open}>
        {open && <RenameForm description={editable} onDone={() => setOpen(false)} target={target} />}
      </Sheet>
    </>
  );
}
