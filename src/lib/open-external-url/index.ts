import { getCustomTabsSupportingBrowsersAsync, openBrowserAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

/** Keep media links in-app to avoid Android dispatch back into Shinobu; opt out only for other paths. */
export async function openExternalUrl(url: string, { inApp = true } = {}): Promise<void> {
  if (!inApp) {
    await Linking.openURL(url);
    return;
  }
  if (process.env.EXPO_OS === 'android') {
    const browsers = await getCustomTabsSupportingBrowsersAsync();
    const browserPackage = browsers.defaultBrowserPackage ?? browsers.preferredBrowserPackage ?? browsers.servicePackages[0];
    if (browserPackage == null) throw new Error('No Custom Tabs browser is installed');
    await openBrowserAsync(url, { browserPackage });
    return;
  }
  await openBrowserAsync(url);
}
