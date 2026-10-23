import appJson from "./app.json";

// Env vars prefixed EXPO_PUBLIC_ are embedded in the client bundle and are
// therefore PUBLIC. Never read a service role key or any secret here.
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
// Firebase config for Android push (FCM). EAS writes the file from a "file"
// environment variable named GOOGLE_SERVICES_JSON and passes its path here, so
// the file is never committed. Without it Android cannot get a push token, and
// a rider is never told an offer exists.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

export default {
  ...appJson,
  expo: {
    ...appJson.expo,
    // Over-the-air updates (EAS Update).
    //
    // This used to be { policy: "fingerprint" }, which sounds safer: the
    // runtime version is derived from the native project, so an update only
    // reaches a build whose native side matches. It cannot work here. The
    // Firebase config below is a *file* environment variable that exists only
    // on EAS, so the fingerprint computed on a developer machine can never
    // equal the one computed on the build worker -- and EAS rejects the build
    // outright ("Runtime version calculated on local machine not equal to
    // runtime version calculated during build") rather than ship a build no
    // local update could ever target.
    //
    // appVersion ties the runtime to expo.version instead: deterministic on
    // both sides, and updates published locally reach the build that shares
    // it. The cost is that the native side is no longer hashed, so bump
    // `version` in app.json whenever a native dependency or config plugin
    // changes -- that is what keeps an update off a build it would crash.
    // No project id (a bare local run) leaves updates off.
    runtimeVersion: { policy: "appVersion" },
    ...(googleServicesFile
      ? { android: { ...appJson.expo.android, googleServicesFile } }
      : {}),
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
