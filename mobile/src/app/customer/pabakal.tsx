import { useCallback, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MerchantButton, MerchantScreen, ui } from "../../components/MerchantUi";
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
import { readPabakalMessage } from "../../lib/pabakal-from-message";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;
const blankItem = () => ({ name: "", quantity: "1" });
const blankStop = (): StopDraft => ({ store: "", items: [blankItem()] });
const ACTIVE: Pabakal["status"][] = ["open", "accepted", "delivering"];
/** The progress bar on a card; cancelled has none. */
const STEPS: Pabakal["status"][] = ["open", "accepted", "delivering", "delivered"];

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
  const activeCount = (mine.data ?? []).filter((p) => ACTIVE.includes(p.status)).length;

  const [view, setView] = useState<"new" | "mine">("new");
  const [stops, setStops] = useState<StopDraft[]>([blankStop()]);
  const [note, setNote] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);
  // Once a message has filled the form, a box the reader could not work out is
  // highlighted until the customer fills it in. Nothing is guessed for them.
  const [filledFromMessage, setFilledFromMessage] = useState(false);

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
      setFilledFromMessage(false);
      setView("mine");
      void queryClient.invalidateQueries({ queryKey: ["pabakal"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not send."),
  });

  const cancel = useMutation({
    mutationFn: cancelPabakal,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pabakal"] }),
    onError: (e) =>
      Alert.alert("Could not cancel", e instanceof Error ? e.message : "Try again."),
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

  /**
   * Read the message into the form. Fill only: nothing is sent here, and the
   * customer still reviews it and taps Send pabakal themselves.
   */
  async function fillFromMessage() {
    const text = message.trim();
    if (!text || reading) return;
    setReading(true);
    setError(null);
    try {
      const parsed = await readPabakalMessage(text);
      if (parsed.length === 0) {
        setError(
          "Could not read that. Fill in the list below, or try a simpler sentence."
        );
        return;
      }
      setStops(parsed);
      setFilledFromMessage(true);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that.");
    } finally {
      setReading(false);
    }
  }

  const extraStores = pabakalFee(stops.length);

  return (
    <MerchantScreen
      title="Pabakal"
      subtitle="Any store in town, bought and brought to you"
      refreshing={mine.isRefetching}
      onRefresh={() => void mine.refetch()}
    >
      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ["new", "New pabakal"],
            ["mine", "My pabakal"],
          ] as const
        ).map(([key, label]) => {
          const selected = view === key;
          return (
            <Pressable
              key={key}
              onPress={() => setView(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                {label}
              </Text>
              {key === "mine" && activeCount > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{activeCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {view === "new" ? (
        <>
          {/* Messenger-style shortcut */}
          <View style={[styles.card, styles.messageCard]}>
            <View style={styles.row}>
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
              <Text style={type.heading}>Type it like on Messenger</Text>
            </View>
            <TextInput
              style={styles.messageBox}
              multiline
              textAlignVertical="top"
              placeholder={
                "pabakal ko dose ka biogesic sa mercury kag duwa ka bulb sa citi"
              }
              placeholderTextColor={colors.textFaint}
              value={message}
              onChangeText={setMessage}
              maxLength={500}
              accessibilityLabel="Describe your pabakal"
            />
            <View style={styles.rowBetween}>
              <Text style={[type.caption, styles.flex]}>
                We fill in the list. You check it before sending.
              </Text>
              <Pressable
                onPress={() => void fillFromMessage()}
                disabled={!message.trim() || reading}
                accessibilityRole="button"
                style={[styles.fillBtn, (!message.trim() || reading) && styles.dim]}
              >
                <Ionicons name="sparkles" size={14} color={colors.textInverse} />
                <Text style={styles.fillLabel}>
                  {reading ? "Reading…" : "Fill list"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 1. What to buy */}
          <Text style={styles.eyebrow}>WHAT TO BUY</Text>
          {stops.map((stop, s) => (
            <StopEditor
              key={s}
              index={s}
              stop={stop}
              highlightBlanks={filledFromMessage}
              removable={stops.length > 1}
              onChange={(next) =>
                setStops((all) => all.map((x, i) => (i === s ? next : x)))
              }
              onRemove={() => setStops((all) => all.filter((_, i) => i !== s))}
            />
          ))}
          {stops.length < PABAKAL_RULES.maxStores ? (
            <Pressable
              onPress={() => setStops((all) => [...all, blankStop()])}
              accessibilityRole="button"
              style={styles.addStore}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.addStoreLabel}>Add another store</Text>
              <Text style={type.caption}>+₱{PABAKAL_RULES.perExtraStore}</Text>
            </Pressable>
          ) : null}

          {/* 2. Where */}
          <View style={styles.rowBetween}>
            <Text style={styles.eyebrow}>DELIVER TO</Text>
            {addresses.length > 0 ? (
              <Pressable
                onPress={() => router.push("/customer/addresses")}
                accessibilityRole="link"
                hitSlop={8}
              >
                <Text style={styles.link}>Manage</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.card}>
            {addresses.length === 0 ? (
              <MerchantButton
                label="Add a delivery address"
                tone="outline"
                onPress={() => router.push("/customer/addresses")}
              />
            ) : (
              addresses.map((a, i) => {
                const active = a.id === addressId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAddressId(a.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[styles.addressRow, i > 0 && styles.divider]}
                  >
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={active ? colors.primary : colors.textFaint}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.strong}>{a.label}</Text>
                      <Text style={type.caption} numberOfLines={1}>
                        {a.address}
                        {a.barangay ? ` · ${a.barangay}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {/* 3. Note */}
          <Text style={styles.eyebrow}>NOTE FOR THE RIDER</Text>
          <TextInput
            style={[styles.card, styles.noteInput]}
            placeholder="Optional, e.g. if out of stock, get the generic"
            placeholderTextColor={colors.textFaint}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            multiline
            accessibilityLabel="Note for the rider"
          />

          {/* Summary */}
          <View style={[styles.card, styles.summary]}>
            <SummaryRow label="Items" value="Receipt total" />
            <SummaryRow label="Delivery fee" value="Same as a food order" />
            {extraStores > 0 ? (
              <SummaryRow
                label={`Extra stores (${stops.length - 1})`}
                value={peso(extraStores)}
              />
            ) : null}
            <View style={styles.cashNote}>
              <Ionicons name="cash-outline" size={16} color={colors.textMuted} />
              <Text style={[type.caption, styles.flex]}>
                Pay in cash when it arrives. Riders buy up to{" "}
                {peso(PABAKAL_RULES.maxCost)} per pabakal.
              </Text>
            </View>
            {error ? <Text style={ui.error}>{error}</Text> : null}
            <MerchantButton
              label="Send pabakal"
              onPress={submit}
              busy={send.isPending}
            />
          </View>
        </>
      ) : (mine.data ?? []).length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="basket-outline" size={40} color={colors.accent} />
          <Text style={type.heading}>
            {mine.isPending ? "Loading…" : "No pabakal yet"}
          </Text>
          {mine.isPending ? null : (
            <>
              <Text style={[type.caption, styles.center]}>
                Medicine, hardware, groceries: anything from a store that isn&apos;t on
                the app.
              </Text>
              <MerchantButton label="Start a pabakal" onPress={() => setView("new")} />
            </>
          )}
        </View>
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
    </MerchantScreen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={type.body}>{label}</Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}

const STATUS_TONE: Record<Pabakal["status"], { fg: string; bg: string }> = {
  open: { fg: colors.warning, bg: colors.goldSoft },
  accepted: { fg: colors.primary, bg: colors.primarySoft },
  delivering: { fg: colors.primary, bg: colors.primarySoft },
  delivered: { fg: colors.success, bg: colors.successSoft },
  cancelled: { fg: colors.textMuted, bg: colors.surface },
};

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
  const tone = STATUS_TONE[p.status];
  const step = STEPS.indexOf(p.status);
  return (
    <View style={[styles.card, styles.orderCard]}>
      <View style={styles.rowBetween}>
        <Text style={styles.strong}>{p.reference}</Text>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.fg }]}>
            {PABAKAL_STATUS_LABEL[p.status]}
          </Text>
        </View>
      </View>

      {step >= 0 ? (
        <View
          style={styles.progress}
          accessibilityLabel={PABAKAL_STATUS_LABEL[p.status]}
        >
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[styles.progressBar, i <= step && styles.progressOn]}
            />
          ))}
        </View>
      ) : null}

      {stopsOf(p).map((stop, i) => (
        <View key={i} style={styles.stopSummary}>
          <View style={styles.row}>
            <Ionicons name="storefront-outline" size={14} color={colors.secondary} />
            <Text style={styles.strong}>{stop.store}</Text>
          </View>
          {stop.items.map((item, j) => (
            <Text key={j} style={[type.body, styles.indent]}>
              {formatLine(item)}
            </Text>
          ))}
        </View>
      ))}

      <View style={[styles.rowBetween, styles.divider]}>
        {due !== null && p.item_cost !== null ? (
          <>
            <Text style={type.caption}>
              Receipt {peso(p.item_cost)} + fees {peso(p.delivery_fee + p.pabakal_fee)}
            </Text>
            <Text style={type.price}>Pay {peso(due)}</Text>
          </>
        ) : (
          <Text style={type.caption}>
            Receipt total + fees {peso(p.delivery_fee + p.pabakal_fee)}, cash on
            delivery
          </Text>
        )}
      </View>

      {p.status === "cancelled" && p.cancel_reason ? (
        <Text style={type.caption}>{p.cancel_reason}</Text>
      ) : null}
      {p.status === "open" ? (
        <Pressable
          onPress={onCancel}
          disabled={cancelling}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.cancel}
        >
          <Text style={styles.cancelLabel}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StopEditor({
  index,
  stop,
  highlightBlanks,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  stop: StopDraft;
  highlightBlanks: boolean;
  removable: boolean;
  onChange: (next: StopDraft) => void;
  onRemove: () => void;
}) {
  const setItem = (i: number, patch: Partial<StopDraft["items"][number]>) =>
    onChange({
      ...stop,
      items: stop.items.map((item, j) => (j === i ? { ...item, ...patch } : item)),
    });
  // A blank quantity counts as 1 for the buttons, so one tap fixes it.
  const step = (i: number, by: number) => {
    const n = Number(stop.items[i].quantity) || 1;
    setItem(i, { quantity: String(Math.min(99, Math.max(1, n + by))) });
  };
  const storeMissing = highlightBlanks && !stop.store.trim();

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.number}>
          <Text style={styles.numberText}>{index + 1}</Text>
        </View>
        <TextInput
          style={[styles.storeInput, storeMissing && styles.inputNeeds]}
          placeholder="Store, e.g. Mercury Drug"
          placeholderTextColor={storeMissing ? colors.danger : colors.textFaint}
          value={stop.store}
          onChangeText={(store) => onChange({ ...stop, store })}
          maxLength={80}
          accessibilityLabel={`Store ${index + 1}`}
          accessibilityHint={storeMissing ? "Store name needed" : undefined}
        />
        {removable ? (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove store ${index + 1}`}
          >
            <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {stop.items.map((item, i) => {
        const qtyMissing = highlightBlanks && !item.quantity.trim();
        return (
          <View key={i} style={[styles.itemRow, styles.divider]}>
            <View style={[styles.stepper, qtyMissing && styles.inputNeeds]}>
              <Pressable
                onPress={() => step(i, -1)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Fewer of item ${i + 1}`}
              >
                <Ionicons name="remove" size={16} color={colors.primary} />
              </Pressable>
              <TextInput
                style={styles.qty}
                keyboardType="number-pad"
                value={item.quantity}
                placeholder="?"
                placeholderTextColor={colors.danger}
                onChangeText={(quantity) =>
                  setItem(i, { quantity: quantity.replace(/\D/g, "") })
                }
                maxLength={2}
                accessibilityLabel={`Quantity of item ${i + 1}`}
                accessibilityHint={qtyMissing ? "Quantity needed" : undefined}
              />
              <Pressable
                onPress={() => step(i, 1)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`More of item ${i + 1}`}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
            <TextInput
              style={styles.itemName}
              placeholder="Item, e.g. Biogesic 500mg"
              placeholderTextColor={colors.textFaint}
              value={item.name}
              onChangeText={(name) => setItem(i, { name })}
              maxLength={100}
              accessibilityLabel={`Item ${i + 1} at store ${index + 1}`}
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
                <Ionicons name="close" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <Pressable
        onPress={() => onChange({ ...stop, items: [...stop.items, blankItem()] })}
        accessibilityRole="button"
        style={[styles.row, styles.divider]}
      >
        <Ionicons name="add" size={18} color={colors.primary} />
        <Text style={styles.link}>Add item</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  dim: { opacity: 0.5 },
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
  eyebrow: { ...type.eyebrow, marginTop: spacing.md },
  strong: { ...type.body, fontWeight: "700" },
  link: { ...type.body, color: colors.primary, fontWeight: "700" },

  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  tabSelected: { backgroundColor: colors.card, ...shadow.card },
  tabLabel: { ...type.label },
  tabLabelSelected: { color: colors.primary },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  tabBadgeText: { color: colors.textInverse, fontSize: 11, fontWeight: "800" },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  messageCard: { borderWidth: 1, borderColor: colors.primarySoft },
  messageBox: {
    minHeight: 84,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  fillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fillLabel: { color: colors.textInverse, fontWeight: "700", fontSize: 14 },

  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: colors.textInverse, fontWeight: "800", fontSize: 13 },
  storeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  qty: {
    width: 28,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    paddingVertical: 4,
  },
  itemName: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.xs },
  inputNeeds: { backgroundColor: colors.dangerSoft },
  addStore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  addStoreLabel: { ...type.body, color: colors.primary, fontWeight: "700" },

  addressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  noteInput: {
    minHeight: 56,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
  },

  summary: { marginTop: spacing.md, gap: spacing.md },
  cashNote: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },

  empty: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.md },

  orderCard: { gap: spacing.md },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontWeight: "800" },
  progress: { flexDirection: "row", gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  progressOn: { backgroundColor: colors.primary },
  stopSummary: { gap: 2 },
  indent: { paddingLeft: 22 },
  cancel: { alignSelf: "flex-start" },
  cancelLabel: { ...type.label, color: colors.danger },
});
