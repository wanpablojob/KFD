import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

/**
 * The privacy policy and terms live on the website (the admin host, /privacy
 * and /terms). The app stores require the policy to be reachable in-app, and
 * the account screen and sign-up form link here.
 */
const apiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

export type LegalPage = "privacy" | "terms";

/** Null when the build has no API URL configured, so callers hide the link. */
export function legalUrl(
  page: LegalPage,
  base: string | undefined = apiUrl
): string | null {
  return base ? `${base.replace(/\/+$/, "")}/${page}` : null;
}

export function openLegal(page: LegalPage): void {
  const url = legalUrl(page);
  if (url) WebBrowser.openBrowserAsync(url).catch(() => {});
}
