import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
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
  fetchMyPabakal,
  PABAKAL_MAX_BUDGET,
  PABAKAL_STATUS_LABEL,
  pabakalAmountDue,
  parseBudget,
  requestPabakal,
  type Pabakal,
} from "../../lib/pabakal";
import { colors, radius, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

/**
 * Pabakal: "buy this for me" from any store, the way KFD took orders on
 * Messenger. The list is free text because the store is not on the app.
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

  const [store, setStore] = useState("");
  const [items, setItems] = useState("");
  const [budget, setBudget] = useState("");
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
      setStore("");
      setItems("");
      setBudget("");
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
    const parsed = parseBudget(budget);
    const address = addresses.find((a) => a.id === addressId);
    if (store.trim().length < 2) return setError("Say which store to buy from.");
    if (items.trim().length < 2) return setError("List what to buy.");
    if ("error" in parsed) return setError(parsed.error);
    if (!address) return setError("Choose a delivery address, or add one.");
    send.mutate({
      store: store.trim(),
      items: items.trim(),
      budget: parsed.value,
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
        <AuthField
          label="Store"
          placeholder="e.g. Mercury Drug, any hardware"
          value={store}
          onChangeText={setStore}
          maxLength={120}
        />
        <AuthField
          label="What to buy"
          placeholder={"e.g.\nBiogesic 500mg x10\n1 pack Bear Brand 300g"}
          value={items}
          onChangeText={setItems}
          multiline
          maxLength={1000}
        />
        <AuthField
          label={`Budget (most the rider can spend, up to ₱${PABAKAL_MAX_BUDGET})`}
          placeholder="e.g. 500"
          value={budget}
          onChangeText={setBudget}
          keyboardType="decimal-pad"
        />
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
          Pay in cash when it arrives: the receipt total, the delivery fee and a small
          pabakal fee. The rider never spends more than your budget.
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
        <Text style={styles.chipLabel}>{p.store}</Text>
        <Text style={styles.status}>{PABAKAL_STATUS_LABEL[p.status]}</Text>
      </View>
      <Text style={type.body}>{p.items}</Text>
      <Text style={ui.muted}>
        {p.reference} · budget {peso(p.budget)} · fees{" "}
        {peso(p.delivery_fee + p.pabakal_fee)}
      </Text>
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

const styles = StyleSheet.create({
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
