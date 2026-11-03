import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MerchantButton } from "../../components/MerchantUi";
import {
  PabakalProgress,
  PabakalRider,
  PabakalStatusPill,
} from "../../components/PabakalStatus";
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { backoffFor } from "../../lib/poll";
import { shortTimestamp } from "../../lib/order-timestamp";
import {
  cancelPabakal,
  fetchMyPabakal,
  formatLine,
  pabakalAmountDue,
  pabakalSize,
  pabakalTimeline,
  receiptUrl,
  stopsOf,
} from "../../lib/pabakal";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

/**
 * One pabakal, in full: where it is, who has it, every store and item, where
 * it goes, the money and the receipt. Opened from a card under My pabakal.
 *
 * It reads the same ["pabakal"] list the tab polls (RLS returns only the
 * customer's own rows), so opening it costs no extra request and both stay in
 * step.
 */
export default function PabakalOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const queryClient = useQueryClient();

  const mine = useQuery({
    queryKey: ["pabakal"],
    queryFn: fetchMyPabakal,
    refetchInterval: (query) => backoffFor(15_000, query.state.fetchFailureCount),
  });
  const p = mine.data?.find((row) => row.id === id);

  const receipt = useQuery({
    queryKey: ["pabakalReceipt", p?.receipt_path],
    queryFn: () => receiptUrl(p?.receipt_path as string),
    enabled: !!p?.receipt_path,
    // The signed URL lasts 10 minutes; refresh it before it lapses.
    staleTime: 8 * 60_000,
  });

  const cancel = useMutation({
    mutationFn: cancelPabakal,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pabakal"] }),
    onError: (e) =>
      Alert.alert("Could not cancel", e instanceof Error ? e.message : "Try again."),
  });

  const back = () =>
    router.canGoBack() ? router.back() : router.navigate("/customer/pabakal");

  if (!p) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={type.heading}>
          {mine.isPending ? "Loading…" : "This pabakal is no longer here"}
        </Text>
        {mine.isPending ? null : <MerchantButton label="Back" onPress={back} />}
      </View>
    );
  }

  const due = pabakalAmountDue(p);
  const stops = stopsOf(p);
  const timeline = pabakalTimeline(p);
  const fees = p.delivery_fee + p.pabakal_fee;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: bottomPadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={mine.isRefetching}
            onRefresh={() => void mine.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <Pressable
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>

        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={type.title}>{p.reference}</Text>
            <Text style={type.caption}>
              {pabakalSize(p)} · {shortTimestamp(p.created_at)}
            </Text>
          </View>
          <PabakalStatusPill status={p.status} />
        </View>
        <PabakalProgress status={p.status} />

        {p.status === "accepted" || p.status === "delivering" ? (
          <View style={styles.card}>
            <PabakalRider p={p} />
          </View>
        ) : null}

        <Section title="Shopping list" icon="basket-outline">
          {stops.map((stop, i) => (
            <View key={i} style={[styles.stop, i > 0 && styles.divider]}>
              <View style={styles.row}>
                <View style={styles.number}>
                  <Text style={styles.numberText}>{i + 1}</Text>
                </View>
                <Text style={styles.strong}>{stop.store}</Text>
              </View>
              {stop.items.map((item, j) => (
                <Text key={j} style={[type.body, styles.indent]}>
                  {formatLine(item)}
                </Text>
              ))}
            </View>
          ))}
        </Section>

        <Section title="Delivery" icon="location-outline">
          <Text style={type.body}>
            {p.delivery_address ?? "No address"}
            {p.barangay ? `, ${p.barangay}` : ""}
          </Text>
          {p.contact_phone ? (
            <Text style={type.caption}>Contact {p.contact_phone}</Text>
          ) : null}
          {p.note ? (
            <View style={[styles.row, styles.divider]}>
              <Ionicons name="chatbox-outline" size={16} color={colors.secondary} />
              <Text style={[type.body, styles.flex]}>{p.note}</Text>
            </View>
          ) : null}
        </Section>

        <Section title="Payment" icon="cash-outline">
          <Line
            label="Items (receipt)"
            value={p.item_cost !== null ? peso(p.item_cost) : "After the rider buys"}
          />
          <Line label="Delivery fee" value={peso(p.delivery_fee)} />
          {p.pabakal_fee > 0 ? (
            <Line
              label={`Extra stores (${stops.length - 1})`}
              value={peso(p.pabakal_fee)}
            />
          ) : null}
          <View style={[styles.rowBetween, styles.divider]}>
            <Text style={styles.strong}>
              {due !== null ? "Pay in cash" : "Fees so far"}
            </Text>
            <Text style={type.price}>{peso(due ?? fees)}</Text>
          </View>
          {p.cash_collected !== null ? (
            <Text style={type.caption}>Paid {peso(p.cash_collected)} at the door</Text>
          ) : null}
        </Section>

        {/* The receipt the rider photographed (0140): what the customer pays. */}
        {p.receipt_path ? (
          <Section title="Receipt" icon="receipt-outline">
            {receipt.data ? (
              <Pressable
                onPress={() => void Linking.openURL(receipt.data as string)}
                accessibilityRole="imagebutton"
                accessibilityLabel="Open the receipt photo"
              >
                <Image
                  source={{ uri: receipt.data }}
                  style={styles.receipt}
                  resizeMode="cover"
                />
              </Pressable>
            ) : (
              <Text style={type.caption}>
                {receipt.isPending ? "Loading the photo…" : "Could not load the photo."}
              </Text>
            )}
          </Section>
        ) : null}

        <Section title="History" icon="time-outline">
          {timeline.map((step) => (
            <View key={step.label} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  step.at ? styles.dotOn : null,
                  step.label === "Cancelled" ? styles.dotCancel : null,
                ]}
              />
              <Text style={[type.body, styles.flex, !step.at && styles.faint]}>
                {step.label}
              </Text>
              <Text style={type.caption}>{step.at ? shortTimestamp(step.at) : ""}</Text>
            </View>
          ))}
          {p.status === "cancelled" && p.cancel_reason ? (
            <Text style={type.caption}>{p.cancel_reason}</Text>
          ) : null}
        </Section>

        {p.status === "open" ? (
          <Pressable
            onPress={() =>
              Alert.alert("Cancel this pabakal?", pabakalSize(p), [
                { text: "Keep it", style: "cancel" },
                {
                  text: "Cancel it",
                  style: "destructive",
                  onPress: () => cancel.mutate(p.id),
                },
              ])
            }
            disabled={cancel.isPending}
            accessibilityRole="button"
            style={styles.cancel}
          >
            <Text style={styles.cancelLabel}>
              {cancel.isPending ? "Cancelling…" : "Cancel this pabakal"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={type.label}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={type.body}>{label}</Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  strong: { ...type.body, fontWeight: "700" },
  faint: { color: colors.textFaint },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  stop: { gap: 2 },
  indent: { paddingLeft: 34 },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: colors.textInverse, fontWeight: "800", fontSize: 13 },
  receipt: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCancel: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  cancel: { alignSelf: "center", paddingVertical: spacing.sm },
  cancelLabel: { ...type.label, color: colors.danger },
});
