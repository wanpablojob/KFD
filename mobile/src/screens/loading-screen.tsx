import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/**
 * Branded loading screen shown while the app restores the session or resolves
 * the signed-in user's role. Uses the app icon (the KFD mark) so nothing new
 * has to ship in the bundle.
 */
export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Image source={require("../../assets/icon.png")} style={styles.logo} />
      <Text style={styles.title}>KFD</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <ActivityIndicator size="large" style={styles.spinner} />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  logo: { width: 96, height: 96, borderRadius: 20 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111",
    marginTop: 12,
  },
  message: { fontSize: 14, color: "#888", marginTop: 4, textAlign: "center" },
  spinner: { marginTop: 24 },
});