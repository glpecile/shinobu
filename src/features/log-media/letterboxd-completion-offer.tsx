import { Button } from '@/components/button';
import { WriteSheet } from '@/features/write-sheet/write-sheet';
import { useCatchUpControls } from '@/features/up-next/catch-up/state';
import type { LogRequest } from './log-request';

/** A separate opt-in step; the next press opens the existing diary confirmation. */
export function LetterboxdCompletionOffer({ request, onClose, onOpenRequest }: { request: LogRequest; onClose: () => void; onOpenRequest?: (request: LogRequest) => void }) {
  const { openLog } = useCatchUpControls();
  return (
    <>
      <WriteSheet.Header done onClose={onClose}>
        <WriteSheet.Title>Series completed</WriteSheet.Title>
      </WriteSheet.Header>
      <WriteSheet.Description>{request.description}</WriteSheet.Description>
      <WriteSheet.Actions>
        <Button icon={<Button.Icon name="eye-outline" />} label={request.title} onPress={() => onOpenRequest != null ? onOpenRequest(request) : openLog(request)} />
      </WriteSheet.Actions>
    </>
  );
}
