import appJson from "./app.json";

// Env vars prefixed EXPO_PUBLIC_ are embedded in the client bundle and are
// therefore PUBLIC. Never read a service role key or any secret here.
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default {
  ...appJson,
  expo: {
    ...appJson.expo,
    // Over-the-air updates (EAS Update). The fingerprint policy derives the
    // runtime version from the native code, so an update is only ever sent to
    // builds whose native side matches it; adding a native module changes the
    // fingerprint and needs a new build. No project id (a bare local run)
    // leaves updates off.
    runtimeVersion: { policy: "fingerprint" },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      // Admin API host, used by mobile push registration. Public: a device
      // must reach it. eslint-disable-next-line no-undef
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      eas: {
        projectId,
      },
    },
  },
};
