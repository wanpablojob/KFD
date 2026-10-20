import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { autoEnablePushOnce } from "../../lib/push";
import { useTabBarInset } from "../../components/TabBarInset";
import { useActiveRestaurants } from "../../lib/hooks";
import { TRAVEL_MINUTES } from "../../lib/delivery-estimate";
import { useCartQuote } from "../../lib/cart-quote";
import { useSession } from "../../lib/session-context";
import { saveContactPhone } from "../../lib/auth";
import {
  loadAddresses,
  saveAddress,
  contactPhoneProblem,
  deleteAddress,
  validateAddress,
  type SavedAddress,
} from "../../lib/addresses";
import { completeAddress } from "../../lib/address-validation";
import {
  fetchServiceAreas,
  placeCustomerOrder,
  type PaymentChoice,
} from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const PAYMENTS: {
  key: PaymentChoice;
  label: string;
  icon: "cash-outline" | "qr-code-outline";
}[] = [
  { key: "cash", label: "Cash on delivery", icon: "cash-outline" },
  { key: "e_wallet", label: "GCash (scan rider's QR)", icon: "qr-code-outline" },
];

/** Review -> address -> pay -> place. Every peso shown here comes from the server. */
export default function CustomerCartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const {
    lines,
    setQuantity,
    remove,
    clear,
    restaurantId,
    restaurantName,
    checkoutRequestId,
  } = useCart();
  const { user } = useSession();
  const [address, setAddress] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [payment, setPayment] = useState<PaymentChoice>("cash");
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  // Saved addresses are the primary path; the free-text form only opens when
  // the customer asks for a new place or has none yet.
  const [adding, setAdding] = useState(false);
  // The rider calls this number; customer_place_order refuses an order without
  // one (0076). Each saved address carries its own, filled in when it is
  // picked. Checkout syncs the chosen number to the account because the RPC
  // still reads the number there.
  const [phone, setPhone] = useState("");
  // Barangays KFD delivers to. Empty until the owner publishes the list, and
  // then the server takes any address, so the picker only shows once it exists.
  const [areas, setAreas] = useState<string[]>([]);
  const [barangay, setBarangay] = useState<string | null>(null);
  // Priced for the chosen barangay so the preview matches the zonal fee charged (0080).
  const { quote, loading: quoting, error: quoteError } = useCartQuote(barangay);
  // The idempotency key comes from the cart context, not this screen: it has to
  // survive the screen remounting while the cart survives, and it is scoped to
  // the contents so an edited cart is a new checkout (cart-context.tsx).

  useEffect(() => {
    let active = true;
    fetchServiceAreas()
      .then((rows) => active && setAreas(rows))
      .catch(() => {
        // Fail open: the server enforces the area, and its message says so.
      });
    return () => {
      active = false;
    };
  }, []);

  // Saved addresses are per-user and live on the device. Prefill the newest so
  // a returning customer does not retype the same barangay every order.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadAddresses(user.id).then((rows) => {
      if (!active) return;
      setAddresses(rows);
      setAddress((prev) => prev || rows[0]?.address || "");
      if (rows[0]?.barangay) setBarangay(rows[0].barangay);
      if (rows[0]?.phone) setPhone(rows[0].phone);
    });
    return () => {
      active = false;
    };
  }, [user]);

  // The text plus the picked barangay. Saving or placing uses this, so the
  // rider always gets the area on the address even when the customer used the
  // picker instead of typing it.
  const completedAddress = completeAddress(address, barangay);
  const addressProblem = address.trim() ? validateAddress(completedAddress) : null;
  const selectedSaved = addresses.find((a) => a.address === address.trim()) ?? null;
  // A saved address already knows its area; do not offer a second, conflicting
  // answer. An older saved address without one still shows the picker.
  const lockedBarangay = selectedSaved?.barangay ?? null;
  const phoneProblem = contactPhoneProblem(phone);
  const canSaveAddress =
    !!user &&
    !addressProblem &&
    !phoneProblem &&
    !savingAddress &&
    (areas.length === 0 || barangay !== null) &&
    !addresses.some((a) => a.address === completedAddress);

  async function handleSaveAddress() {
    if (!user || !canSaveAddress) return;
    setSavingAddress(true);
    try {
      const next = await saveAddress(
        user.id,
        completedAddress,
        undefined,
        barangay,
        phone
      );
      setAddresses(next);
      setAddress(completedAddress);
      setAdding(false);
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleDeleteAddress(id: string) {
    if (!user) return;
    setAddresses(await deleteAddress(user.id, id));
  }

  function handleSelectAddress(row: SavedAddress) {
    setAddress(row.address);
    setBarangay(row.barangay ?? null);
    setPhone(row.phone ?? "");
    setAdding(false);
    setError(null);
  }

  function cancelAdd() {
    setAdding(false);
    setError(null);
    const first = addresses[0];
    setAddress(first?.address ?? "");
    setBarangay(first?.barangay ?? null);
    setPhone(first?.phone ?? "");
  }

  // No local arithmetic on purpose. A subtotal computed here would have to be
  // re-derived from prices that may have changed since the menu was cached, and
  // the fee in particular has no client copy worth having.
  const subtotal = quote?.subtotal ?? null;
  const total = quote?.total ?? null;
  // Anything but a settled quote means the button would charge a number the
  // customer has not actually seen.
  // The restaurant as the catalogue last saw it: open or not, and its prep
  // time for the estimate. The server still refuses a closed kitchen; this
  // only says so before the customer taps, instead of after.
  const { data: catalogue } = useActiveRestaurants();
  const kitchen = (catalogue ?? []).find((r) => r.id === restaurantId) ?? null;
  const kitchenClosed = kitchen !== null && !kitchen.is_open;
  const canPlace = quote !== null && !quoting && !placing && !kitchenClosed;

  async function handlePlaceOrder() {
    if (placing) return;
    const trimmedAddress = completedAddress;
    if (lines.length === 0) return;
    // Guard the invariant the button also enforces, so a race between the tap
    // and the re-price cannot place an order against a stale total.
    if (!quote) {
      setError("Still pricing your cart. Try again in a moment.");
      return;
    }
    // Only null for an empty cart, which the guard above already returned on.
    if (!checkoutRequestId) {
      setError("Your cart changed. Review it and try again.");
      return;
    }
    if (!restaurantId) {
      setError("Your cart has items from more than one place. Start a new cart.");
      return;
    }
    if (!trimmedAddress) {
      setError("Enter a delivery address.");
      return;
    }
    // Validate with the same rule the address book uses, so a saved and a typed
    // address are held to one bar. The server stores whatever it is given.
    const problem = validateAddress(trimmedAddress);
    if (problem) {
      setError(problem.message);
      return;
    }
    if (areas.length > 0 && !barangay) {
      setError("Choose your barangay.");
      return;
    }
    const newPhone = phone.trim();
    if (phoneProblem) {
      setError(phoneProblem);
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      // customer_place_order copies the number from the auth account onto the
      // order, so sync this address's number there before placing it.
      await saveContactPhone(newPhone);
      const result = await placeCustomerOrder({
        restaurantId,
        items: lines.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
        })),
        deliveryAddress: trimmedAddress,
        payment,
        requestId: checkoutRequestId,
        barangay,
      });
      clear();
      // The moment alerts start to matter: ask once so "on the way" and
      // "delivered" reach this phone. Never blocks or delays the tracker.
      void autoEnablePushOnce();
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
        <Ionicons name="cart-outline" size={48} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={type.body}>Add something tasty to get started.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.browseBtn,
            shadow.card,
            pressed && styles.browseBtnPressed,
          ]}
          onPress={() => router.navigate("/customer/shops")}
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
        <View style={styles.backBtn} />
        <View style={styles.topTitles}>
          <Text style={styles.topTitle}>Your cart</Text>
          {restaurantName ? (
            <Text style={type.caption} numberOfLines={1}>
              {restaurantName}
            </Text>
          ) : null}
        </View>
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
        {addresses.length > 0 ? (
          <View style={styles.savedAddresses}>
            {addresses.map((a) => {
              const active = a.address === address.trim();
              return (
                <View
                  key={a.id}
                  style={[styles.savedChip, active && styles.savedChipActive]}
                >
                  <Pressable
                    style={styles.savedChipBody}
                    onPress={() => handleSelectAddress(a)}
                    disabled={placing}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.savedChipLabel,
                        active && styles.savedChipLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                    <Text style={styles.savedChipText} numberOfLines={1}>
                      {a.address}
                      {a.barangay ? ` · ${a.barangay}` : ""}
                    </Text>
                    {a.phone ? (
                      <Text style={styles.savedChipText} numberOfLines={1}>
                        {a.phone}
                      </Text>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDeleteAddress(a.id)}
                    disabled={placing}
                    accessibilityLabel={`Delete ${a.label}`}
                  >
                    <Ionicons name="close" size={14} color={colors.textFaint} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {adding || addresses.length === 0 ? (
          <>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="House no., street, barangay, city"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              editable={!placing}
              accessibilityLabel="New delivery address"
            />
            {addresses.length > 0 ? (
              <Pressable
                style={styles.cancelAdd}
                onPress={cancelAdd}
                disabled={placing}
                accessibilityRole="button"
              >
                <Text style={styles.cancelAddLabel}>Cancel</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable
            style={styles.addAddress}
            onPress={() => {
              setAdding(true);
              setAddress("");
              setError(null);
            }}
            disabled={placing}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.secondary} />
            <Text style={styles.addAddressLabel}>Add a new address</Text>
          </Pressable>
        )}

        {canSaveAddress && (adding || addresses.length === 0) ? (
          <Pressable
            style={styles.saveAddress}
            onPress={() => void handleSaveAddress()}
            disabled={savingAddress}
          >
            <Text style={styles.saveAddressLabel}>
              {savingAddress ? "Saving…" : "Save this address"}
            </Text>
          </Pressable>
        ) : null}
        {addressProblem ? (
          <Text style={styles.error}>{addressProblem.message}</Text>
        ) : null}
        {areas.length > 0 && !barangay ? (
          <Text style={styles.hint}>
            Pick your barangay so the delivery fee is right.
          </Text>
        ) : null}

        {areas.length > 0 && lockedBarangay ? (
          <View style={styles.lockedArea}>
            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
            <Text style={type.caption}>Delivering to Barangay {lockedBarangay}.</Text>
          </View>
        ) : areas.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>BARANGAY</Text>
            <View style={styles.areas}>
              {areas.map((area) => {
                const active = barangay === area;
                return (
                  <Pressable
                    key={area}
                    style={[styles.area, active && styles.areaActive]}
                    onPress={() => setBarangay(active ? null : area)}
                    disabled={placing}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.areaLabel, active && styles.areaLabelActive]}>
                      {area}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.fieldLabel}>CONTACT NUMBER</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="0917 123 4567"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!placing}
          accessibilityLabel="Contact number for your rider"
        />
        {phone.trim() && phoneProblem ? (
          <Text style={styles.error}>{phoneProblem}</Text>
        ) : (
          <Text style={styles.hint}>The rider calls this number when they arrive.</Text>
        )}

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
                <Ionicons
                  name={p.icon}
                  size={24}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.payLabel, active && styles.payLabelActive]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.totalCard, shadow.card]}>
          {/* "—" rather than a guess: a stale or assumed figure here is the
              exact failure this screen was rewritten to prevent. */}
          <BillLine label="Subtotal" value={peso(subtotal)} />
          <BillLine
            label="Delivery fee"
            value={
              quote?.fee_agreed_in_person
                ? "Agreed with rider"
                : peso(quote?.delivery_fee ?? null)
            }
          />
          <BillLine label="Service fee" value={peso(quote?.service_fee ?? null)} />
          <View style={styles.divider} />
          <BillLine label="Total" value={peso(total)} bold />
        </View>

        {kitchen ? (
          <View style={styles.etaRow}>
            <Ionicons
              name={kitchenClosed ? "close-circle-outline" : "time-outline"}
              size={16}
              color={kitchenClosed ? colors.danger : colors.textMuted}
            />
            <Text style={kitchenClosed ? styles.etaClosed : type.caption}>
              {kitchenClosed
                ? `${kitchen.name} has closed for now. Your cart is saved for when it opens.`
                : `Delivery in about ${kitchen.prep_minutes + TRAVEL_MINUTES.min}–${kitchen.prep_minutes + TRAVEL_MINUTES.max} min`}
            </Text>
          </View>
        ) : null}

        {quoteError ? <Text style={styles.error}>{quoteError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* The cart is a tab, so its footer sits just above the floating bar. */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom:
              tabInset > 0 ? tabInset + spacing.sm : insets.bottom + spacing.md,
          },
        ]}
      >
        <Pressable
          onPress={handlePlaceOrder}
          disabled={!canPlace}
          style={({ pressed }) => [
            styles.checkoutBtn,
            shadow.raised,
            !canPlace && styles.checkoutDisabled,
            pressed && canPlace && styles.checkoutPressed,
          ]}
        >
          {placing || quoting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : total !== null ? (
            <Text style={styles.checkoutLabel}>ORDER NOW · ₱{total.toFixed(2)}</Text>
          ) : (
            <Text style={styles.checkoutLabel}>TOTAL UNAVAILABLE</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Peso, or an em dash when the server has not priced this cart yet. */
function peso(value: number | null): string {
  return value === null ? "—" : `₱${value.toFixed(2)}`;
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
  topTitles: { flex: 1, alignItems: "center" },
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
  areas: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  area: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  areaActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  areaLabel: { ...type.label, color: colors.text },
  areaLabelActive: { color: colors.textInverse },
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
  savedAddresses: { gap: spacing.sm },
  savedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  savedChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  savedChipBody: { flex: 1, gap: 1 },
  savedChipLabel: { ...type.label, color: colors.textMuted },
  savedChipLabelActive: { color: colors.primaryDark },
  savedChipText: { ...type.caption, color: colors.textFaint },
  saveAddress: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.secondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  saveAddressLabel: { ...type.label, color: colors.secondary },
  addAddress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
  },
  addAddressLabel: { ...type.label, color: colors.secondary },
  cancelAdd: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  cancelAddLabel: {
    ...type.caption,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
  hint: { ...type.caption, color: colors.textFaint },
  lockedArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
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
  checkoutDisabled: { opacity: 0.5 },
  checkoutPressed: { backgroundColor: colors.primaryDark },
  checkoutLabel: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.textInverse,
  },
  etaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  etaClosed: { ...type.caption, color: colors.danger, fontWeight: "700", flex: 1 },
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
