// Injects an Android release signing config sourced from gradle properties,
// falling back to the generated debug signing when they're absent (KTD-2).
// Property names and the debug-fallback shape mirror React Native's own
// documented pattern (https://reactnative.dev/docs/signed-apk-android),
// which the generated app/build.gradle already links to in a comment. CI
// supplies the properties as ORG_GRADLE_PROJECT_* env vars, decoding the
// keystore from a GitHub secret — never committed here or anywhere else.
//
// CNG-safe: this is a config plugin (the sanctioned native-edit mechanism,
// AGENTS.md), never a hand-edit of the generated android/ output. Guarded by
// RELEASE_SIGNING_MARKER so re-running `expo prebuild` against an
// already-modified build.gradle (no --clean) is a no-op, not a double-apply.

const RELEASE_SIGNING_MARKER = 'SHINOBU_UPLOAD_STORE_FILE';

const SIGNING_CONFIG_BLOCK = `        release {
            if (project.hasProperty('${RELEASE_SIGNING_MARKER}')) {
                storeFile file(${RELEASE_SIGNING_MARKER})
                storePassword SHINOBU_UPLOAD_STORE_PASSWORD
                keyAlias SHINOBU_UPLOAD_KEY_ALIAS
                keyPassword SHINOBU_UPLOAD_KEY_PASSWORD
            }
        }`;

// Matches the two-comment-line preamble + `signingConfig signingConfigs.debug`
// that Expo's template writes only inside buildTypes.release (buildTypes.debug
// has the same signingConfig line with no such preamble, so this anchor is
// unique to the release block).
const RELEASE_SIGNING_CONFIG_LINE =
  /(\/\/ Caution! In production, you need to generate your own keystore file\.\s*\n\s*\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/;

function withReleaseSigning(config) {
  return require('expo/config-plugins').withAppBuildGradle(config, (buildGradleConfig) => {
    if (buildGradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        `with-release-signing: expected Groovy app/build.gradle, got "${buildGradleConfig.modResults.language}"`,
      );
    }

    let contents = buildGradleConfig.modResults.contents;

    if (!contents.includes(RELEASE_SIGNING_MARKER)) {
      if (!/signingConfigs\s*\{/.test(contents)) {
        throw new Error(
          'with-release-signing: could not find a signingConfigs block in app/build.gradle',
        );
      }
      contents = contents.replace(
        /signingConfigs\s*\{/,
        (match) => `${match}\n${SIGNING_CONFIG_BLOCK}`,
      );

      if (!RELEASE_SIGNING_CONFIG_LINE.test(contents)) {
        throw new Error(
          'with-release-signing: could not find the release buildType signingConfig line in app/build.gradle',
        );
      }
      contents = contents.replace(
        RELEASE_SIGNING_CONFIG_LINE,
        `$1signingConfig project.hasProperty('${RELEASE_SIGNING_MARKER}') ? signingConfigs.release : signingConfigs.debug`,
      );
    }

    buildGradleConfig.modResults.contents = contents;
    return buildGradleConfig;
  });
}

module.exports = withReleaseSigning;
