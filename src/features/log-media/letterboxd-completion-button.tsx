import { Button } from '@/components/button';
import { useCatchUpControls } from '@/features/log-media/session/state';
import type { NormalizedMediaItem } from '@/types/media';
import { useLetterboxdCompletion } from './use-letterboxd-completion';

/** Completed details keep this opt-in action available after an episode sheet closes. */
export function LetterboxdCompletionButton({ item }: { item: NormalizedMediaItem }) {
  const { openLog } = useCatchUpControls();
  const request = useLetterboxdCompletion(item)();
  if (request == null) return null;
  return <Button className="mb-3" icon={<Button.Icon name="eye-outline" />} label={request.title} variant="log" onPress={() => openLog(request)} />;
}
