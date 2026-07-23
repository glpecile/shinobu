import { openBrowserAsync } from 'expo-web-browser';

/** Opens `url` in the in-app browser (KTD-4) — never `Linking`, which hands off to Safari/Chrome. */
export async function openExternalUrl(url: string): Promise<void> {
  await openBrowserAsync(url);
}
