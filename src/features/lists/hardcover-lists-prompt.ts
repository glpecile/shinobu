import { useHardcoverListsRefused } from '@/state/session';

export function useHardcoverListsPrompt(): { title: string; body: string } {
  return useHardcoverListsRefused()
    ? {
        title: 'Hardcover gave no list access',
        body: 'Hardcover connected without list access. If reconnecting does not help, open the GitHub link in Settings to report the problem. Your library and logging keep working.',
      }
    : {
        title: 'Reconnect Hardcover',
        body: 'Hardcover lists need a new permission. Reconnect to see them here. Your library and logging keep working.',
      };
}
