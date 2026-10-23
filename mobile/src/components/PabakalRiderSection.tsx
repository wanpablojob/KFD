import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MerchantButton, ui } from "./MerchantUi";
import {
  claimPabakal,
  fetchMyPabakal,
  fetchOpenPabakal,
  markPabakalBought,
  markPabakalDelivered,
  releasePabakal,
  formatLine,
  PABAKAL_RULES,
  pabakalAmountDue,
  stopsOf,
  type Pabakal,
} from "../lib/pabakal";
import { colors, radius, spacing, type } from "../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;

/**
 * Pabakal on the rider's Available tab (0120): the job they are doing, then
 * the open requests. The rider fronts the cash, so it is one job at a time and
 * never more than PABAKAL_RULES.maxCost, which the server enforces.
 */
export function PabakalRiderSection({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const open = useQuery({
    queryKey: ["pabakal-open"],
    queryFn: fetchOpenPabakal,
    refetchInterval: 15_000,
  });
  const mine = useQuery({
    queryKey: ["pabakal"],
    queryFn: fetchMyPabakal,
    refetchInterval: 15_000,
  });
  const active = (mine.data ?? []).find(
    (p) => p.status === "accepted" || p.status === "delivering"
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["pabakal-open"] });
    void queryClient.invalidateQueries({ queryKey: ["pabakal"] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Try again.");
  const claim = useMutation({ mutationFn: claimPabakal, onSuccess: refresh, onError });

  if (!active && (open.data ?? []).length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Pabakal</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {active ? (
        <ActiveJob
          job={active}
          disabled={disabled}
          onDone={refresh}
          onError={onError}
        />
      ) : (
        (open.data ?? []).map((p) => (
          <View key={p.id} style={styles.card}>
            <Stops p={p} />
            {p.note ? <Text style={ui.muted}>Note: {p.note}</Text> : null}
            <Text style={ui.muted}>
              {p.barangay ? `${p.barangay} · ` : ""}you earn{" "}
              {peso(p.delivery_fee + p.pabakal_fee)}
            </Text>
            <MerchantButton
              label="Take this pabakal"
              busy={claim.isPending && claim.variables === p.id}
              disabled={disabled}
              onPress={() => claim.mutate(p.id)}
            />
          </View>
        ))
      )}
    </View>
  );
}

function ActiveJob({
  job,
  disabled,
  onDone,
  onError,
}: {
  job: Pabakal;
  disabled: boolean;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const [amount, setAmount] = useState("");
  const value = Number(amount.trim());
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;
  const bought = useMutation({
    mutationFn: () => markPabakalBought(job.id, value),
    onSuccess: () => {
      setAmount("");
      onDone();
    },
    onError,
  });
  const delivered = useMutation({
    mutationFn: () => markPabakalDelivered(job.id, value),
    onSuccess: onDone,
    onError,
  });
  const release = useMutation({
    mutationFn: () => releasePabakal(job.id),
    onSuccess: onDone,
    onError,
  });
  const due = pabakalAmountDue(job);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{job.reference}</Text>
      <Stops p={job} />
      {job.note ? <Text style={ui.muted}>Note: {job.note}</Text> : null}
      <Text style={ui.muted}>
        {job.customer_name} · {job.delivery_address}
        {job.barangay ? `, ${job.barangay}` : ""}
      </Text>
      {job.contact_phone ? (
        <MerchantButton
          label={`Call ${job.contact_phone}`}
          tone="outline"
          onPress={() => void Linking.openURL(`tel:${job.contact_phone}`)}
        />
      ) : null}

      {job.status === "accepted" ? (
        <>
          <Text style={ui.muted}>
            Buy everything on the list, up to{" "}
            {peso(Math.min(job.budget ?? PABAKAL_RULES.maxCost, PABAKAL_RULES.maxCost))}
            . Enter the total of all receipts.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Receipt total, e.g. 245.50"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            accessibilityLabel="Receipt total"
          />
          <MerchantButton
            label="Bought it"
            busy={bought.isPending}
            disabled={disabled || !valid || value <= 0}
            onPress={() => bought.mutate()}
          />
          {/* Only before buying: after that the rider's own money is spent. */}
          <MerchantButton
            label="Can't do it, give it back"
            tone="danger"
            busy={release.isPending}
            disabled={disabled}
            onPress={() =>
              Alert.alert(
                "Give this pabakal back?",
                "It goes back to the list for another rider.",
                [
                  { text: "Keep it", style: "cancel" },
                  {
                    text: "Give it back",
                    style: "destructive",
                    onPress: () => release.mutate(),
                  },
                ]
              )
            }
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>
            Collect {due !== null ? peso(due) : "—"} in cash
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Cash collected"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            accessibilityLabel="Cash collected"
          />
          <MerchantButton
            label="Delivered"
            busy={delivered.isPending}
            disabled={disabled || !valid}
            onPress={() => delivered.mutate()}
          />
        </>
      )}
    </View>
  );
}

/** Each store with what to buy there, in the order the customer listed them. */
function Stops({ p }: { p: Pick<Pabakal, "stops" | "store" | "items"> }) {
  return (
    <>
      {stopsOf(p).map((stop, i) => (
        <View key={i}>
          <Text style={styles.title}>{stop.store}</Text>
          {stop.items.map((item, j) => (
            <Text key={j} style={type.body}>
              {formatLine(item)}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.md },
  heading: { ...type.caption, color: colors.textMuted, textTransform: "uppercase" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { ...type.body, fontWeight: "700", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 16,
  },
});
