/**
 * Appens inställningar = app.json, plus Google Maps-nycklarna.
 *
 * Nycklarna ligger inte i koden. De är sparade som miljövariabler (Sensitive) i projektet på
 * expo.dev och hämtas när appen byggs med EAS: GOOGLE_MAPS_IOS_KEY och GOOGLE_MAPS_ANDROID_KEY.
 * De är låsta i Google Cloud (iPhone-nyckeln till appens bundle-id, Android-nyckeln till Maps SDK
 * for Android) — se även src/components/map/mapStyle.ts.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-maps",
      {
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    ],
  ],
});
