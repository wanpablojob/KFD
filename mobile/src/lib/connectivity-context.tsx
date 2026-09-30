import { createContext, use, useEffect, useState, type PropsWithChildren } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

export interface ConnectivityState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: NetInfoState["type"] | null;
}

const ConnectivityContext = createContext<ConnectivityState | null>(null);

export function ConnectivityProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<ConnectivityState>({
    isConnected: null,
    isInternetReachable: null,
    type: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netInfo) => {
      setState({
        isConnected: netInfo.isConnected,
        isInternetReachable: netInfo.isInternetReachable,
        type: netInfo.type,
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <ConnectivityContext.Provider value={state}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityState {
  const value = use(ConnectivityContext);
  if (!value) {
    throw new Error("useConnectivity must be used inside a <ConnectivityProvider />");
  }
  return value;
}

export function ConnectivityBanner() {
  const { isConnected, isInternetReachable } = useConnectivity();

  if (isConnected === null) return null;

  const offline = isConnected === false || isInternetReachable === false;

  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You&apos;re offline — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.goldSoft,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gold,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.warning,
    textAlign: "center",
  },
});
