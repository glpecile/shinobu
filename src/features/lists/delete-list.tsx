import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from '@/lib/window-dimensions';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Tooltip } from '@/components/tooltip';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { haptics } from '@/lib/haptics';
import { openExternalUrl } from '@/lib/open-external-url';
import { routes } from '@/lib/routes';
import { toast } from '@/lib/toast';
import { useDeleteHardcoverList } from '@/state/queries/list-membership';
import { ToolbarIcon } from './list-header';

function DeleteConfirm({ id, title, url, onCancel }: { id: string; title: string; url: string; onCancel: () => void }) {
  const router = useRouter();
  const mutation = useDeleteHardcoverList(id);
  function confirm() {
    haptics.destructive();
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('List deleted', title);
        onCancel();
        if (router.canGoBack()) router.back();
        else router.replace(routes.hardcoverLists('created'));
      },
      onError: () => haptics.error(),
    });
  }
  return (
    <WriteSheet.Step>
      <WriteSheet.Header><WriteSheet.Title>Delete list?</WriteSheet.Title></WriteSheet.Header>
      <WriteSheet.Description>{`This deletes "${title}" on Hardcover for good. Its books stay in your library.`}</WriteSheet.Description>
      {mutation.isError && <WriteSheet.Error>{mutation.error.message}</WriteSheet.Error>}
      <WriteSheet.Actions>
        <Button icon={<Button.Icon name="trash-outline" />} label={mutation.isError ? 'Try again' : 'Delete list'} loading={mutation.isPending} loadingLabel="Deleting…" onPress={confirm} />
        {mutation.isError && <Button icon={<Button.Icon name="open-outline" />} label="Open on Hardcover" onPress={() => void openExternalUrl(url)} variant="quiet" />}
        <Button disabled={mutation.isPending} icon={<Button.Icon name="close" />} label="Cancel" onPress={onCancel} variant="quiet" />
      </WriteSheet.Actions>
    </WriteSheet.Step>
  );
}

/** The owner's delete control for a Hardcover list's toolbar, and the confirm it opens. Icon-only on a phone, as `RenameList`. */
export function DeleteList({ id, title, url }: { id: string; title: string; url: string }) {
  const [open, setOpen] = useState(false);
  const compact = useWindowDimensions().width < 640;
  return (
    <>
      {compact
        ? <ToolbarIcon><Tooltip label="Delete list"><Button icon={<Button.Icon name="trash-outline" />} iconOnly label="Delete list" onPress={() => setOpen(true)} size="sm" variant="quiet" /></Tooltip></ToolbarIcon>
        : <Button icon={<Button.Icon name="trash-outline" />} label="Delete" onPress={() => setOpen(true)} size="sm" variant="quiet" />}
      <Sheet onClose={() => setOpen(false)} open={open}>
        {open && <DeleteConfirm id={id} onCancel={() => setOpen(false)} title={title} url={url} />}
      </Sheet>
    </>
  );
}
