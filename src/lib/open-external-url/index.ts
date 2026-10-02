import { getCustomTabsSupportingBrowsersAsync, openBrowserAsync } from 'expo-web-browser';

/** Uses the in-app browser, never OS link dispatch, which could route View on back into Shinobu. */
export async function openExternalUrl(url: string): Promise<void> {
  if (process.env.EXPO_OS === 'android') {
    const browsers = await getCustomTabsSupportingBrowsersAsync();
    const browserPackage = browsers.defaultBrowserPackage ?? browsers.preferredBrowserPackage ?? browsers.servicePackages[0];
    if (browserPackage == null) throw new Error('No Custom Tabs browser is installed');
    await openBrowserAsync(url, { browserPackage });
    return;
  }
  await openBrowserAsync(url);
}
