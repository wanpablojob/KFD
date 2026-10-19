import Constants from "expo-constants";
import { supabase } from "./supabase";

/**
 * The admin app's base URL, injected by app.config.js.
 *
 * Undefined in a build that was not given EXPO_PUBLIC_API_URL. Every caller
 * treats that as "not configured" rather than crashing, because these POSTs
 * are always follow-ups to work that has already been saved.
 */
const apiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

/**
 * POST to the admin app's API with the signed-in user's token.
 *
 * Best-effort by design: order mail and push are courtesies on top of a write
 * that already landed, so this reports success as a boolean and never throws
 * into the caller. Shared by the merchant screens (status changes, dispatch)
 * and the storefront (order placement) so there is one way to reach the API.
 */
export async function postApi(
  path: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!apiUrl || !session?.access_token) return false;
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
