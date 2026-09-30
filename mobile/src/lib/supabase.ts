import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { Database } from "./database";

/**
 * The project URL must be the bare project URL with NO `/rest/v1` suffix.
 * A suffixed URL was shipped once in the admin app and broke every sign-in
 * with "Invalid path specified in request URL". Keep any future value here
 * bare.
 */
const url = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const publishableKey = Constants.expoConfig?.extra?.supabasePublishableKey as
  string | undefined;

if (!url || !publishableKey) {
  throw new Error(
    "Supabase URL and publishable key are not configured. Set " +
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in " +
      "mobile/.env.local and run `npx expo start`."
  );
}

/**
 * The session token is a credential, so it goes in the OS keychain via
 * expo-secure-store, never AsyncStorage (which is plaintext on disk).
 */
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // The native OAuth flow (signInWithProvider) exchanges a PKCE code
    // returned to the app's own scheme; implicit would ship tokens in the
    // callback URL, which is the flow expo-auth-session cannot safely reuse.
    flowType: "pkce",
  },
});
