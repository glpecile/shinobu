import { useHardcoverListsRefused } from '@/state/session';

/** What a list surface says to a Hardcover session without the list scopes. */
export function useHardcoverListsPrompt(): { title: string; body: string } {
  return useHardcoverListsRefused()
    ? {
        title: 'Hardcover gave no list access',
        body: 'Hardcover connected, but without the list permission. The app registration on hardcover.app must allow read:lists and write:lists. Add them there, then connect again. Your library and logging keep working.',
      }
    : {
        title: 'Reconnect Hardcover',
        body: 'Hardcover lists need a new permission. Reconnect to see them here. Your library and logging keep working.',
      };
}
