import { afterEach, expect, mock, test } from 'bun:test';

let browsers: { defaultBrowserPackage?: string; preferredBrowserPackage?: string; servicePackages: string[] };
const opened: Array<{ url: string; options?: { browserPackage?: string } }> = [];
mock.module('expo-web-browser', () => ({
  getCustomTabsSupportingBrowsersAsync: async () => browsers,
  openBrowserAsync: async (url: string, options?: { browserPackage?: string }) => {
    opened.push({ url, options });
  },
}));
const { openExternalUrl } = await import('./index');
const originalPlatform = process.env.EXPO_OS;

afterEach(() => {
  if (originalPlatform == null) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalPlatform;
  opened.length = 0;
});

test('Android outbound links target a browser package instead of redispatching to Shinobu', async () => {
  process.env.EXPO_OS = 'android';
  browsers = { preferredBrowserPackage: 'org.mozilla.firefox', servicePackages: ['org.mozilla.firefox'] };
  await openExternalUrl('https://letterboxd.com/film/alien/');
  expect(opened).toEqual([{ url: 'https://letterboxd.com/film/alien/', options: { browserPackage: 'org.mozilla.firefox' } }]);
});

test('Android without a Custom Tabs browser never falls back to an unscoped intent', async () => {
  process.env.EXPO_OS = 'android';
  browsers = { servicePackages: [] };
  await expect(openExternalUrl('https://www.imdb.com/title/tt0078748/')).rejects.toThrow('No Custom Tabs browser');
  expect(opened).toEqual([]);
});

test('iOS keeps the in-app Safari browser without Android discovery', async () => {
  process.env.EXPO_OS = 'ios';
  await openExternalUrl('https://anilist.co/anime/1');
  expect(opened).toEqual([{ url: 'https://anilist.co/anime/1', options: undefined }]);
});
