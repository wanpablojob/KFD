import { useCallback, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthField } from "../../components/AuthField";
import {
  MerchantButton,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { loadAddresses, type SavedAddress } from "../../lib/addresses";
import { useSession } from "../../lib/session-context";
import {
  cancelPabakal,
  cleanStops,
  fetchMyPabakal,
  formatLine,
  PABAKAL_RULES,
  PABAKAL_STATUS_LABEL,
  pabakalAmountDue,
  pabakalFee,
  requestPabakal,
  stopsOf,
  type Pabakal,
  type StopDraft,
} from "../../lib/pabakal";
import { colors, radius, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;
const blankItem = () => ({ name: "", quantity: "1" });
const blankStop = (): StopDraft => ({ store: "", items: [blankItem()] });

/**
 * Pabakal: "buy this for me" from any store, the way KFD took orders on
 * Messenger. Stores and items are typed because the stores are not on the app.
 */
export default function PabakalScreen() {
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["pabakal"],
    queryFn: fetchMyPabakal,
    refetchInterval: 15_000,
  });

  const [stops, setStops] = useState<StopDraft[]>([blankStop()]);
  const [note, setNote] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Addresses live on the device and are edited in Delivery addresses, so
  // reload whenever this tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void loadAddresses(user.id).then((rows) => {
        setAddresses(rows);
        setAddressId((prev) =>
          rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null)
        );
      });
    }, [user])
  );

  const send = useMutation({
    mutationFn: requestPabakal,
    onSuccess: () => {
      setStops([blankStop()]);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["pabakal"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not send."),
  });

  const cancel = useMutation({
    mutationFn: cancelPabakal,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pabakal"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Could not cancel."),
  });

  function submit() {
    setError(null);
    const cleaned = cleanStops(stops);
    const address = addresses.find((a) => a.id === addressId);
    if ("error" in cleaned) return setError(cleaned.error);
    if (!address) return setError("Choose a delivery address, or add one.");
    send.mutate({
      stops: cleaned.stops,
      note,
      address: address.address,
      barangay: address.barangay,
      phone: address.phone,
    });
  }

  return (
    <MerchantScreen
      title="Pabakal"
      subtitle="We'll buy it for you from any store in town"
      refreshing={mine.isRefetching}
      onRefresh={() => void mine.refetch()}
    >
      <MerchantSection label="What do you need?">
        {stops.map((stop, s) => (
          <StopEditor
            key={s}
            index={s}
            stop={stop}
            removable={stops.length > 1}
            onChange={(next) =>
              setStops((all) => all.map((x, i) => (i === s ? next : x)))
            }
            onRemove={() => setStops((all) => all.filter((_, i) => i !== s))}
          />
        ))}
        {stops.length < PABAKAL_RULES.maxStores ? (
          <MerchantButton
            label={`Add another store (+₱${PABAKAL_RULES.perExtraStore})`}
            tone="outline"
            onPress={() => setStops((all) => [...all, blankStop()])}
          />
        ) : null}
        <AuthField
          label="Note for the rider (optional)"
          placeholder="e.g. if out of stock, get the generic"
          value={note}
          onChangeText={setNote}
          maxLength={300}
        />

        <Text style={styles.label}>Deliver to</Text>
        {addresses.length === 0 ? (
          <MerchantButton
            label="Add a delivery address"
            tone="outline"
            onPress={() => router.push("/customer/addresses")}
          />
        ) : (
          addresses.map((a) => {
            const active = a.id === addressId;
            return (
              <Pressable
                key={a.id}
                onPress={() => setAddressId(a.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={styles.chipLabel}>{a.label}</Text>
                <Text style={ui.muted} numberOfLines={1}>
                  {a.address}
                  {a.barangay ? ` · ${a.barangay}` : ""}
                </Text>
              </Pressable>
            );
          })
        )}

        <Text style={ui.muted}>
          Pay in cash when it arrives: the receipt total, the delivery fee and a{" "}
          {peso(pabakalFee(stops.length))} pabakal fee. Riders buy up to{" "}
          {peso(PABAKAL_RULES.maxCost)} per pabakal.
        </Text>
        {error ? <Text style={ui.error}>{error}</Text> : null}
        <MerchantButton label="Send pabakal" onPress={submit} busy={send.isPending} />
      </MerchantSection>

      <MerchantSection label="Your pabakal">
        {(mine.data ?? []).length === 0 ? (
          <Text style={ui.muted}>{mine.isPending ? "Loading…" : "Nothing yet."}</Text>
        ) : (
          (mine.data ?? []).map((p) => (
            <PabakalCard
              key={p.id}
              p={p}
              cancelling={cancel.isPending && cancel.variables === p.id}
              onCancel={() =>
                Alert.alert("Cancel this pabakal?", p.store, [
                  { text: "Keep it", style: "cancel" },
                  {
                    text: "Cancel it",
                    style: "destructive",
                    onPress: () => cancel.mutate(p.id),
                  },
                ])
              }
            />
          ))
        )}
      </MerchantSection>
    </MerchantScreen>
  );
}

function PabakalCard({
  p,
  cancelling,
  onCancel,
}: {
  p: Pabakal;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const due = pabakalAmountDue(p);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.chipLabel}>{p.reference}</Text>
        <Text style={styles.status}>{PABAKAL_STATUS_LABEL[p.status]}</Text>
      </View>
      {stopsOf(p).map((stop, i) => (
        <View key={i}>
          <Text style={styles.storeName}>{stop.store}</Text>
          {stop.items.map((item, j) => (
            <Text key={j} style={type.body}>
              {formatLine(item)}
            </Text>
          ))}
        </View>
      ))}
      <Text style={ui.muted}>Fees {peso(p.delivery_fee + p.pabakal_fee)}</Text>
      {due !== null && p.item_cost !== null ? (
        <Text style={styles.due}>
          Receipt {peso(p.item_cost)} · pay {peso(due)} in cash
        </Text>
      ) : null}
      {p.status === "cancelled" && p.cancel_reason ? (
        <Text style={ui.muted}>{p.cancel_reason}</Text>
      ) : null}
      {p.status === "open" ? (
        <MerchantButton
          label="Cancel"
          tone="danger"
          busy={cancelling}
          onPress={onCancel}
        />
      ) : null}
    </View>
  );
}

function StopEditor({
  index,
  stop,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  stop: StopDraft;
  removable: boolean;
  onChange: (next: StopDraft) => void;
  onRemove: () => void;
}) {
  const setItem = (i: number, patch: Partial<StopDraft["items"][number]>) =>
    onChange({
      ...stop,
      items: stop.items.map((item, j) => (j === i ? { ...item, ...patch } : item)),
    });

  return (
    <View style={styles.stop}>
      <View style={styles.cardHead}>
        <Text style={styles.storeName}>Store {index + 1}</Text>
        {removable ? (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button">
            <Text style={styles.remove}>Remove store</Text>
          </Pressable>
        ) : null}
      </View>
      <AuthField
        label="Store name"
        placeholder="e.g. Mercury Drug, any hardware"
        value={stop.store}
        onChangeText={(store) => onChange({ ...stop, store })}
        maxLength={80}
      />
      <Text style={styles.label}>Items and quantity</Text>
      {stop.items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <TextInput
            style={[styles.input, styles.itemName]}
            placeholder="e.g. Biogesic 500mg"
            placeholderTextColor={colors.textFaint}
            value={item.name}
            onChangeText={(name) => setItem(i, { name })}
            maxLength={100}
            accessibilityLabel={`Item ${i + 1} at store ${index + 1}`}
          />
          <TextInput
            style={[styles.input, styles.qty]}
            keyboardType="number-pad"
            value={item.quantity}
            onChangeText={(quantity) => setItem(i, { quantity })}
            maxLength={2}
            accessibilityLabel={`Quantity of item ${i + 1}`}
          />
          {stop.items.length > 1 ? (
            <Pressable
              onPress={() =>
                onChange({ ...stop, items: stop.items.filter((_, j) => j !== i) })
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove item ${i + 1}`}
            >
              <Ionicons name="close" size={20} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable
        onPress={() => onChange({ ...stop, items: [...stop.items, blankItem()] })}
        accessibilityRole="button"
        style={styles.addItem}
      >
        <Ionicons name="add" size={18} color={colors.primary} />
        <Text style={styles.addItemLabel}>Add item</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stop: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  storeName: { ...type.body, fontWeight: "700", color: colors.text },
  remove: { ...type.caption, color: colors.danger },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16,
  },
  itemName: { flex: 1 },
  qty: { width: 52, textAlign: "center" },
  addItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  addItemLabel: { ...type.body, color: colors.primary, fontWeight: "600" },
  label: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipLabel: { ...type.body, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  status: { ...type.caption, color: colors.primary, fontWeight: "700" },
  due: { ...type.body, fontWeight: "700", color: colors.text },
});
