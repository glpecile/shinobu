// Gives the Android adaptive icon a black background in dark mode, matching
// ios-icon-dark.png. Expo writes `iconBackground` (app.json
// adaptiveIcon.backgroundColor) only to values/colors.xml; this overrides it in
// values-night. Launchers re-read it on a theme change.
const { AndroidConfig, withAndroidColorsNight } = require('expo/config-plugins');

module.exports = (config) =>
  withAndroidColorsNight(config, (colorsConfig) => {
    colorsConfig.modResults = AndroidConfig.Colors.assignColorValue(colorsConfig.modResults, {
      name: 'iconBackground',
      value: '#000000',
    });
    return colorsConfig;
  });
