import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../../lib/cart-context";
import { placeCustomerOrder, type PaymentChoice } from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const DELIVERY_FEE = 45;
const SERVICE_FEE = 5;

const PAYMENTS: { key: PaymentChoice; label: string; glyph: string }[] = [
  { key: "cash", label: "Cash on delivery", glyph: "₱" },
  { key: "e_wallet", label: "E-Wallet (GCash)", glyph: "◉" },
  { key: "card", label: "Card", glyph: "▭" },
];

/** Review -> address -> pay -> place. Totals mirror the server. */
export default function CustomerCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lines, setQuantity, remove, subtotal, clear, restaurantId } = useCart();
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<PaymentChoice>("cash");
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const total = subtotal + DELIVERY_FEE + SERVICE_FEE;

  async function handlePlaceOrder() {
    if (placing) return;
    const trimmedAddress = address.trim();
    if (lines.length === 0) return;
    if (!restaurantId) {
      setError("Your cart has items from more than one place. Start a new cart.");
      return;
    }
    if (!trimmedAddress) {
      setError("Enter a delivery address.");
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      const result = await placeCustomerOrder({
        restaurantId,
        items: lines.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
        })),
        deliveryAddress: trimmedAddress,
        payment,
      });
      clear();
      router.replace({
        pathname: "/track",
        params: { ref: result.reference },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order failed. Try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyGlyph}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={type.body}>Add something tasty to get started.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.browseBtn,
            shadow.card,
            pressed && styles.browseBtnPressed,
          ]}
          onPress={() => router.replace("/customer")}
        >
          <Text style={styles.browseLabel}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { paddingTop: spacing.lg + insets.top }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>Your cart</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {lines.map((line) => (
          <View key={line.menu_item_id} style={[styles.line, shadow.card]}>
            <View style={styles.lineInfo}>
              <Text style={styles.lineName} numberOfLines={1}>
                {line.name}
              </Text>
              <Text style={type.price}>₱{(line.price * line.quantity).toFixed(2)}</Text>
            </View>
            <View style={styles.lineFoot}>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setQuantity(line.menu_item_id, line.quantity - 1)}
                  accessibilityLabel={`Remove one ${line.name}`}
                >
                  <Text style={styles.stepMinus}>−</Text>
                </Pressable>
                <Text style={styles.stepQty}>{line.quantity}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setQuantity(line.menu_item_id, line.quantity + 1)}
                  accessibilityLabel={`Add one ${line.name}`}
                >
                  <Text style={styles.stepPlus}>+</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => remove(line.menu_item_id)}
                accessibilityLabel={`Remove ${line.name}`}
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.fieldLabel}>DELIVERY ADDRESS</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="House no., street, barangay, city"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          editable={!placing}
        />

        <Text style={styles.fieldLabel}>PAYMENT METHOD</Text>
        <View style={styles.payRow}>
          {PAYMENTS.map((p) => {
            const active = payment === p.key;
            return (
              <Pressable
                key={p.key}
                style={[
                  styles.payCard,
                  active && styles.payCardActive,
                  active && shadow.card,
                ]}
                onPress={() => setPayment(p.key)}
                disabled={placing}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.payGlyph, active && styles.payGlyphActive]}>
                  {p.glyph}
                </Text>
                <Text style={[styles.payLabel, active && styles.payLabelActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.totalCard, shadow.card]}>
          <BillLine label="Subtotal" value={`₱${subtotal.toFixed(2)}`} />
          <BillLine label="Delivery fee" value={`₱${DELIVERY_FEE.toFixed(2)}`} />
          <BillLine label="Service fee" value={`₱${SERVICE_FEE.toFixed(2)}`} />
          <View style={styles.divider} />
          <BillLine label="Total" value={`₱${total.toFixed(2)}`} bold />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.checkoutBtn,
            shadow.raised,
            pressed && styles.checkoutPressed,
          ]}
          onPress={handlePlaceOrder}
          disabled={placing}
        >
          {placing ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.checkoutLabel}>ORDER NOW · ₱{total.toFixed(2)}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function BillLine({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.billLine}>
      <Text style={[styles.billLabel, bold && styles.billBold]}>{label}</Text>
      <Text style={[styles.billValue, bold && styles.billBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
  },
  backBtn: { width: 32, height: 32, justifyContent: "center" },
  backGlyph: { fontSize: 30, color: colors.text, lineHeight: 32 },
  topTitle: { ...type.heading, color: colors.text },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  line: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  lineInfo: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  lineName: { flex: 1, ...type.body, fontWeight: "700" },
  lineFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  stepBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  stepMinus: { fontSize: 18, fontWeight: "800", color: colors.secondary },
  stepPlus: { fontSize: 18, fontWeight: "800", color: colors.primary },
  stepQty: {
    minWidth: 20,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  remove: { fontSize: 12, fontWeight: "600", color: colors.danger },
  fieldLabel: { ...type.eyebrow, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  payRow: { flexDirection: "row", gap: spacing.sm },
  payCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  payCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  payGlyph: { fontSize: 18, color: colors.secondary },
  payGlyphActive: { color: colors.primary },
  payLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
  },
  payLabelActive: { color: colors.primaryDark, fontWeight: "700" },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  billLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  billLabel: { ...type.body, color: colors.textMuted },
  billValue: { ...type.body, fontWeight: "700" },
  billBold: { fontSize: 17, fontWeight: "800", color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  checkoutBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  checkoutPressed: { backgroundColor: colors.primaryDark },
  checkoutLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.textInverse,
  },
  emptyGlyph: { fontSize: 44 },
  emptyTitle: { ...type.title, color: colors.textMuted },
  browseBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  browseBtnPressed: { backgroundColor: colors.primaryDark },
  browseLabel: { fontSize: 14, fontWeight: "800", color: colors.textInverse },
});
