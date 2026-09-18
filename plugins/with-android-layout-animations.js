// Turns on LayoutAnimation for Android, which React Native ships disabled
// (`enableLayoutAnimationsOnAndroid`). Without it `LayoutAnimation.configureNext`
// is a no-op there and every disclosure snaps open (`DISCLOSURE_LAYOUT` in
// src/lib/motion.ts).
//
// `loadReactNative` already spends the one `ReactNativeFeatureFlags.override`
// a process gets, so this force-overrides straight after it with the stable
// new-architecture defaults plus this flag. Shinobu runs at the stable release
// level, whose overrides are exactly those defaults, so nothing else changes.

const MARKER = 'enableLayoutAnimationsOnAndroid';

const IMPORTS = `import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults
`;

const OVERRIDE = `
    ReactNativeFeatureFlags.dangerouslyForceOverride(
      object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
        override fun ${MARKER}(): Boolean = true
      }
    )`;

function withAndroidLayoutAnimations(config) {
  return require('expo/config-plugins').withMainApplication(config, (mainConfig) => {
    let contents = mainConfig.modResults.contents;
    if (contents.includes(MARKER)) return mainConfig;
    if (!contents.includes('loadReactNative(this)')) {
      throw new Error(
        'with-android-layout-animations: could not find loadReactNative(this) in MainApplication',
      );
    }
    contents = contents
      .replace(/\nimport /, `\n${IMPORTS}import `)
      .replace('loadReactNative(this)', `loadReactNative(this)${OVERRIDE}`);
    mainConfig.modResults.contents = contents;
    return mainConfig;
  });
}

module.exports = withAndroidLayoutAnimations;
