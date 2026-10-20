import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Alert,
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
import { useScrollBottomPadding } from "../../components/TabBarInset";
import { useSession } from "../../lib/session-context";
import {
  ADDRESS_LIMIT,
  contactPhoneProblem,
  deleteAddress,
  loadAddresses,
  saveAddress,
  validateAddress,
  type SavedAddress,
} from "../../lib/addresses";
import { completeAddress } from "../../lib/address-validation";
import { fetchServiceAreas } from "../../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

/**
 * The customer's address book.
 *
 * It lives in the profile rather than only inside checkout: a customer should
 * be able to save home and work once, then tap one at checkout instead of
 * retyping an address and picking a barangay on every order. Storage is the
 * per-user AsyncStorage list in lib/addresses.ts, so it stays on this phone.
 *
 * Each saved address carries the service area it sits in. Checkout uses that
 * to price the order immediately; only an address saved without a barangay
 * still asks for one.
 */
export default function CustomerAddressesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = useScrollBottomPadding();
  const { user } = useSession();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [barangay, setBarangay] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([
      loadAddresses(user.id),
      fetchServiceAreas().catch(() => [] as string[]),
    ]).then(([rows, areaRows]) => {
      if (!active) return;
      setAddresses(rows);
      setAreas(areaRows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const atLimit = addresses.length >= ADDRESS_LIMIT;
  const completed = completeAddress(address, barangay);
  const addressProblem = address.trim() ? validateAddress(completed) : null;
  const phoneProblem = phone.trim() ? contactPhoneProblem(phone) : null;
  const canSave =
    !!user &&
    !saving &&
    !atLimit &&
    address.trim().length > 0 &&
    addressProblem === null &&
    phone.trim().length > 0 &&
    phoneProblem === null &&
    (areas.length === 0 || barangay !== null);

  function resetForm() {
    setLabel("");
    setAddress("");
    setBarangay(null);
    setPhone("");
    setError(null);
  }

  async function handleSave() {
    if (!user || !canSave) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveAddress(user.id, completed, label, barangay, phone);
      setAddresses(next);
      resetForm();
      setNotice("Saved. You can pick it at checkout.");
    } catch {
      setError("Could not save this address. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(row: SavedAddress) {
    Alert.alert("Delete this address?", row.address, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!user) return;
          void deleteAddress(user.id, row.id).then(setAddresses);
        },
      },
    ]);
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
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Delivery addresses</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={type.caption}>
          Saved on this phone. At checkout, tap an address and its contact number goes
          to the rider.
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : addresses.length === 0 ? (
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={type.body}>
              Add your home, work, or the place you usually order to. You will not have
              to type it again.
            </Text>
          </View>
        ) : (
          addresses.map((row) => (
            <View key={row.id} style={[styles.addressCard, shadow.card]}>
              <View style={styles.addressBody}>
                <Text style={styles.addressLabel}>{row.label}</Text>
                <Text style={styles.addressText}>{row.address}</Text>
                {row.barangay ? (
                  <Text style={styles.addressArea}>Barangay {row.barangay}</Text>
                ) : null}
                <View style={styles.phoneRow}>
                  <Ionicons
                    name="call-outline"
                    size={14}
                    color={row.phone ? colors.textMuted : colors.danger}
                  />
                  <Text style={row.phone ? styles.addressArea : styles.phoneMissing}>
                    {row.phone ??
                      "No contact number. Delete and add it again with one."}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => confirmDelete(row)}
                hitSlop={8}
                accessibilityLabel={`Delete ${row.label}`}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
              </Pressable>
            </View>
          ))
        )}

        {!loading && atLimit ? (
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.cardTitle}>Address book full</Text>
            <Text style={type.body}>
              You can keep {ADDRESS_LIMIT} addresses. Delete one above to add another.
            </Text>
          </View>
        ) : null}

        {!loading && !atLimit ? (
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.cardTitle}>
              {addresses.length === 0
                ? "Add your first address"
                : "Add another address"}
            </Text>

            <Text style={styles.fieldLabel}>LABEL (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Home, Work, Mom's house"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>ADDRESS</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="House no., street, barangay, city"
              placeholderTextColor={colors.textFaint}
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>CONTACT NUMBER</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0917 123 4567"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!saving}
              accessibilityLabel="Contact number for this address"
            />
            <Text style={styles.hint}>
              The rider calls this number when they arrive.
            </Text>

            {areas.length > 0 ? (
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
                        disabled={saving}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[styles.areaLabel, active && styles.areaLabelActive]}
                        >
                          {area}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!barangay ? (
                  <Text style={styles.hint}>
                    Pick your barangay so the delivery fee is right.
                  </Text>
                ) : null}
              </>
            ) : null}

            {addressProblem ? (
              <Text style={styles.error}>{addressProblem.message}</Text>
            ) : null}
            {phoneProblem ? <Text style={styles.error}>{phoneProblem}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.save,
                !canSave && styles.saveDisabled,
                pressed && canSave && styles.savePressed,
              ]}
              disabled={!canSave}
              onPress={() => void handleSave()}
              accessibilityRole="button"
            >
              <Text style={styles.saveLabel}>
                {saving ? "Saving…" : "Save address"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  phoneMissing: { ...type.caption, color: colors.danger, flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
  },
  backBtn: { width: 32, height: 32, justifyContent: "center" },
  topTitle: { ...type.heading, color: colors.text },
  list: { padding: spacing.lg, gap: spacing.md },
  center: { paddingVertical: spacing.xxl, alignItems: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { ...type.heading, color: colors.text },
  emptyTitle: { ...type.title, color: colors.textMuted },
  addressCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  addressBody: { flex: 1, gap: 2 },
  addressLabel: { ...type.label, color: colors.primary },
  addressText: { ...type.body, fontWeight: "600", color: colors.text },
  addressArea: { ...type.caption, color: colors.textMuted },
  deleteBtn: { padding: 2 },
  fieldLabel: { ...type.eyebrow, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
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
  hint: { ...type.caption, color: colors.textFaint },
  error: { ...type.caption, color: colors.danger },
  notice: { ...type.caption, color: colors.textMuted },
  save: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  saveDisabled: { backgroundColor: colors.border },
  savePressed: { opacity: 0.7 },
  saveLabel: { fontSize: 15, fontWeight: "700", color: colors.textInverse },
});
