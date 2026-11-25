// Expo writes `iconBackground` only to values/colors.xml; override it in values-night.
const { AndroidConfig, withAndroidColorsNight } = require('expo/config-plugins');

module.exports = (config) =>
  withAndroidColorsNight(config, (colorsConfig) => {
    colorsConfig.modResults = AndroidConfig.Colors.assignColorValue(colorsConfig.modResults, {
      name: 'iconBackground',
      value: '#000000',
    });
    return colorsConfig;
  });
