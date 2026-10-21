/**
 * Appens inställningar = app.json, plus Google Maps-nycklarna och Google-inloggningen.
 *
 * Nycklarna ligger inte i koden. De är sparade som miljövariabler (Sensitive) i projektet på
 * expo.dev och hämtas när appen byggs med EAS: GOOGLE_MAPS_IOS_KEY och GOOGLE_MAPS_ANDROID_KEY.
 * De är låsta i Google Cloud (iPhone-nyckeln till appens bundle-id, Android-nyckeln till Maps SDK
 * for Android) — se även src/components/map/mapStyle.ts.
 *
 * Google-inloggningen behöver appens klient-id:n från Google Cloud (expo.extra.googleSignIn i
 * app.json — de är inte hemliga). iPhone-id:t blir en adress som Google svarar till efter
 * inloggningen; insticksmodulen läggs bara till när id:t finns, annars stoppar den bygget.
 */
module.exports = ({ config }) => {
  const iosClientId = config.extra?.googleSignIn?.iosClientId ?? "";
  const googleSignIn = iosClientId
    ? [["@react-native-google-signin/google-signin", {
      iosUrlScheme: `com.googleusercontent.apps.${iosClientId.replace(".apps.googleusercontent.com", "")}`,
    }]]
    : [];
  return {
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
      ...googleSignIn,
    ],
  };
};
