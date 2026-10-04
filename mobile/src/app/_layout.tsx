import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SessionProvider, useSession } from "../lib/session-context";
import { useSessionUser } from "../lib/auth";
import { LoadingScreen } from "../screens/loading-screen";
import { queryClient, persister, PersistQueryClientProvider } from "../lib/queryClient";
import { ConnectivityProvider, ConnectivityBanner } from "../lib/connectivity-context";
import { initSentry, setSentryUser, clearSentryUser } from "../lib/sentry";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * Initialize Sentry as early as possible.
 */
initSentry();

/**
 * Root navigator for the KFD mobile app (Expo Router, SDK 57).
 *
 * Route guard model: every screen is declared with a Stack.Protected guard so
 * the router redirects away from screens a given session or role must not see,
 * including on deep links:
 *
 *   - signed out        -> (public) index=landing, login, track
 *   - rider             -> rider
 *   - merchant/admin    -> account (web-console notice + push toggle)
 *   - track             -> always public (customers track by reference)
 *
 * The session and role are resolved once in <SessionProvider>; this layout only
 * reads the result, so guards are synchronous and correct on cold start.
 */
function RootNavigator() {
  const { user, sessionLoading, role, roleError, retryRole, leave } = useSession();

  // A tap on a delivered push ("New order KFD-…" with data.reference) opens the
  // public tracking screen for that reference. getLastNotificationResponse
  // also covers the cold-start case (app launched by tapping a notification).
  useEffect(() => {
    function redirect(response: Notifications.NotificationResponse) {
      const reference = response.notification.request.content.data?.reference;
      if (typeof reference === "string" && reference) {
        router.push(`/track?ref=${encodeURIComponent(reference)}`);
      }
    }

    const last = Notifications.getLastNotificationResponse();
    if (last) redirect(last);

    const subscription =
      Notifications.addNotificationResponseReceivedListener(redirect);
    return () => subscription.remove();
  }, []);

  if (sessionLoading) {
    return <LoadingScreen message="Restoring session…" />;
  }

  if (user && role === null && !roleError) {
    return <LoadingScreen message="Signing in…" />;
  }

  if (user && roleError) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Could not load your account</Text>
        <Text style={styles.errorBody}>
          We could not resolve your role. Check your connection and try again.
        </Text>
        <Pressable style={styles.retryButton} onPress={retryRole}>
          <Text style={styles.retryLabel}>TRY AGAIN</Text>
        </Pressable>
        <Pressable style={styles.signOutLink} onPress={leave}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  const signedOut = !user;
  const isRider = !!user && role?.role === "rider";
  const isCustomer = !!user && role?.role === "customer";
  const isStaff = !!user && !!role && role.role !== "rider";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <ConnectivityBanner />
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        {/*
         * Rider application. Declared with the signed-out group because an
         * applicant only needs an auth identity, not a rider role -- a new
         * signup lands here rather than being told they are already a rider.
         */}
        <Stack.Screen name="rider-apply" />
      </Stack.Protected>
      <Stack.Protected guard={isRider}>
        <Stack.Screen name="rider" />
      </Stack.Protected>
      <Stack.Protected guard={isCustomer}>
        <Stack.Screen name="customer" />
      </Stack.Protected>
      <Stack.Protected guard={isStaff}>
        <Stack.Screen name="account" />
      </Stack.Protected>
      {/*
       * Public tracking is declared LAST on purpose. When a screen becomes
       * protected (e.g. a signed-in customer leaving /login), the navigator
       * redirects to the first available screen in the stack. If `track` came
       * first it would win that race and a customer would land on the tracking
       * page instead of the storefront.
       */}
      <Stack.Screen name="track" />
    </Stack>
  );
}

export default function RootLayout() {
  const { user } = useSessionUser();
  // Set/clear Sentry user context based on auth state
  if (user) {
    setSentryUser({ id: user.id, email: user.email ?? undefined });
  } else {
    clearSentryUser();
  }

  // Remount the provider per signed-in user (or anon) so role/error state resets
  // on session change without imperative clears. useSessionUser is cheap here —
  // it reads the same client singleton the provider uses — and lets us key it.
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <SessionProvider key={user?.id ?? "anon"}>
        <SafeAreaProvider>
          <ConnectivityProvider>
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </ConnectivityProvider>
        </SafeAreaProvider>
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.primary,
  },
  errorBody: { ...type.body, color: colors.textMuted, lineHeight: 20 },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  retryLabel: {
    ...type.label,
    color: colors.textInverse,
    letterSpacing: 2,
  },
  signOutLink: { alignItems: "center", paddingVertical: spacing.md },
  signOutLabel: {
    ...type.label,
    color: colors.secondary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
