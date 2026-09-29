import appJson from "./app.json";

// Env vars prefixed EXPO_PUBLIC_ are embedded in the client bundle and are
// therefore PUBLIC. Never read a service role key or any secret here.
export default {
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  },
};