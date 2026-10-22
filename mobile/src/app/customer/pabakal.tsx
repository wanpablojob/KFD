import { useCallback, useRef, useState, type ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MerchantButton } from "../../components/MerchantUi";
import { NotificationBell } from "../../components/NotificationBell";
import { useKeyboardVisible } from "../../components/GlassSurface";
import { useScrollBottomPadding, useTabBarInset } from "../../components/TabBarInset";
import { loadAddresses, type SavedAddress } from "../../lib/addresses";
import { useSession } from "../../lib/session-context";
import {
  cancelPabakal,
  cleanStops,
  fetchMyPabakal,
  formatLine,
  mergeStops,
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
import { chatIntent, type ChatIntent } from "../../lib/pabakal-parse";
import { colors, radius, shadow, spacing, type } from "../../lib/theme";

const peso = (n: number) => `₱${n.toFixed(2)}`;
const blankItem = () => ({ name: "", quantity: "1" });
const ACTIVE: Pabakal["status"][] = ["open", "accepted", "delivering"];
/** The progress bar on a card; cancelled has none. */
const STEPS: Pabakal["status"][] = ["open", "accepted", "delivering", "delivered"];

interface Bubble {
  id: number;
  from: "kfd" | "me";
  text: string;
}

/** Where the chat is: building the list, choosing the address, or confirming. */
type Stage = "items" | "address" | "confirm";

const GREETING =
  "Hi! Ano ipabakal mo? Tell me what to buy and where.\n\n" +
  'e.g. "dose ka biogesic sa mercury kag duwa ka bulb sa citi"';

const EXAMPLE = '"duwa ka biogesic sa mercury"';
const CHAT_REPLY: Record<Exclude<ChatIntent, "shopping">, string> = {
  greeting: `Hello! Ano ipabakal mo? Tell me what to buy and from which store, e.g. ${EXAMPLE}.`,
  thanks: "Walay sapayan! Anything else to buy?",
  other: `I can only take pabakal here. Tell me what to buy and from which store, e.g. ${EXAMPLE}. For other questions, open Account → Help & support.`,
};

const itemCount = (stops: StopDraft[]) => stops.reduce((n, s) => n + s.items.length, 0);
const hasBlanks = (stops: StopDraft[]) =>
  stops.some((s) => !s.store.trim() || s.items.some((i) => !i.quantity.trim()));

/**
 * Pabakal is a chat: the customer says what to buy the way they would on
 * KFD's Messenger, and the reply is the list, read by AI (with a rule-based
 * fallback on the phone). Fill only: the chat never sends anything until the
 * customer taps Send pabakal, which is where the server validates and places it.
 */
export default function PabakalScreen() {
  const { user } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const keyboardUp = useKeyboardVisible();
  const bottomPadding = useScrollBottomPadding();
  const queryClient = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);

  const mine = useQuery({
    queryKey: ["pabakal"],
    queryFn: fetchMyPabakal,
    refetchInterval: 15_000,
  });
  const activeCount = (mine.data ?? []).filter((p) => ACTIVE.includes(p.status)).length;

  const [view, setView] = useState<"chat" | "mine">("chat");
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 0, from: "kfd", text: GREETING },
  ]);
  const [stage, setStage] = useState<Stage>("items");
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [reading, setReading] = useState(false);

  // Addresses live on the device and are edited in Delivery addresses, so
  // reload whenever this tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void loadAddresses(user.id).then(setAddresses);
    }, [user])
  );

  const say = useCallback((from: Bubble["from"], text: string) => {
    setBubbles((all) => [...all, { id: nextId.current++, from, text }]);
  }, []);

  const send = useMutation({
    mutationFn: requestPabakal,
    onSuccess: () => {
      say(
        "kfd",
        "Sent! We're finding a rider now. Follow it under My pabakal.\n\nNeed something else? Just tell me."
      );
      setStops([]);
      setNote("");
      setAddressId(null);
      setStage("items");
      void queryClient.invalidateQueries({ queryKey: ["pabakal"] });
    },
    onError: (e) => {
      say(
        "kfd",
        e instanceof Error ? e.message : "That did not go through. Try again."
      );
    },
  });

  const cancel = useMutation({
    mutationFn: cancelPabakal,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pabakal"] }),
    onError: (e) =>
      Alert.alert("Could not cancel", e instanceof Error ? e.message : "Try again."),
  });

  /** A typed message: more items while building, the rider's note when confirming. */
  async function submitDraft() {
    const text = draft.trim();
    if (!text || reading) return;
    setDraft("");
    say("me", text);

    // Small talk is answered, never read into items or sent to the AI.
    const intent = chatIntent(text);
    if (intent !== "shopping" && !(stage === "confirm" && intent === "other")) {
      say("kfd", CHAT_REPLY[intent]);
      return;
    }

    if (stage === "confirm") {
      setNote((n) => (n ? `${n}\n${text}` : text).slice(0, 300));
      say("kfd", "Noted for the rider. Tap Send pabakal when you're ready.");
      return;
    }

    setReading(true);
    try {
      const parsed = await readPabakalMessage(text);
      if (parsed.length === 0) {
        say(
          "kfd",
          'Sorry, I couldn\'t read that. Try something like "2 biogesic sa mercury".'
        );
        return;
      }
      const next = mergeStops(stops, parsed).slice(0, PABAKAL_RULES.maxStores);
      setStops(next);
      setStage("items");
      setEditing(hasBlanks(next));
      const added = itemCount(parsed);
      say(
        "kfd",
        hasBlanks(next)
          ? `Got ${added} item${added === 1 ? "" : "s"}, but I couldn't tell everything. Fill in the red boxes below.`
          : `Got it: ${next.length} store${next.length === 1 ? "" : "s"}, ${itemCount(next)} item${itemCount(next) === 1 ? "" : "s"}. Check the list below, or tell me more.`
      );
    } catch (e) {
      say("kfd", e instanceof Error ? e.message : "Sorry, I couldn't read that.");
    } finally {
      setReading(false);
    }
  }

  function confirmList() {
    const cleaned = cleanStops(stops);
    say("me", "Looks right");
    if ("error" in cleaned) {
      setEditing(true);
      say("kfd", `${cleaned.error} Fix it in the list below.`);
      return;
    }
    setEditing(false);
    setStage("address");
    say(
      "kfd",
      addresses.length === 0
        ? "Where should we deliver? You have no saved address yet: add one first."
        : "Where should we deliver?"
    );
  }

  function chooseAddress(a: SavedAddress) {
    setAddressId(a.id);
    setStage("confirm");
    say("me", `Deliver to ${a.label}`);
    say(
      "kfd",
      "Here's your pabakal. Anything for the rider? Type it below, or tap Send pabakal."
    );
  }

  function placeIt() {
    const cleaned = cleanStops(stops);
    const address = addresses.find((a) => a.id === addressId);
    if ("error" in cleaned || !address) return;
    say("me", "Send pabakal");
    send.mutate({
      stops: cleaned.stops,
      note,
      address: address.address,
      barangay: address.barangay,
      phone: address.phone,
    });
  }

  function startOver() {
    setStops([]);
    setNote("");
    setAddressId(null);
    setEditing(false);
    setStage("items");
    setBubbles([{ id: nextId.current++, from: "kfd", text: GREETING }]);
  }

  const address = addresses.find((a) => a.id === addressId);
  const extraStores = pabakalFee(stops.length);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.rowBetween}>
          <View style={styles.row}>
            <View style={styles.avatarLarge}>
              <Ionicons name="basket" size={20} color={colors.textInverse} />
            </View>
            <View>
              <Text style={type.title}>Pabakal</Text>
              <Text style={type.caption}>Any store in town · cash on delivery</Text>
            </View>
          </View>
          <View style={styles.row}>
            {view === "chat" && bubbles.length > 1 ? (
              <Pressable
                onPress={startOver}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Start over"
              >
                <Ionicons name="refresh" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <NotificationBell />
          </View>
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(
            [
              ["chat", "Chat"],
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
      </View>

      {view === "mine" ? (
        <ScrollView
          contentContainerStyle={[styles.mineList, { paddingBottom: bottomPadding }]}
          refreshControl={
            <RefreshControl
              refreshing={mine.isRefetching}
              onRefresh={() => void mine.refetch()}
              tintColor={colors.primary}
            />
          }
        >
          {(mine.data ?? []).length === 0 ? (
            <View style={[styles.card, styles.empty]}>
              <Ionicons name="basket-outline" size={40} color={colors.accent} />
              <Text style={type.heading}>
                {mine.isPending ? "Loading…" : "No pabakal yet"}
              </Text>
              {mine.isPending ? null : (
                <MerchantButton label="Start a chat" onPress={() => setView("chat")} />
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
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.chat}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {bubbles.map((b) => (
              <ChatBubble key={b.id} from={b.from} text={b.text} />
            ))}
            {reading ? <ChatBubble from="kfd" text="" typing /> : null}

            {/* The live panel for where the chat is. */}
            {stage === "items" && stops.length > 0 && !reading ? (
              <View style={styles.panel}>
                {editing ? (
                  <>
                    {stops.map((stop, s) => (
                      <StopEditor
                        key={s}
                        index={s}
                        stop={stop}
                        highlightBlanks
                        removable
                        onChange={(next) =>
                          setStops((all) => all.map((x, i) => (i === s ? next : x)))
                        }
                        onRemove={() =>
                          setStops((all) => all.filter((_, i) => i !== s))
                        }
                      />
                    ))}
                  </>
                ) : (
                  <ListSummary stops={stops} />
                )}
                <View style={styles.chips}>
                  <Chip
                    label={editing ? "Done editing" : "Edit list"}
                    icon={editing ? "checkmark" : "create-outline"}
                    onPress={() => setEditing((e) => !e)}
                  />
                  <Chip
                    label="Looks right"
                    icon="arrow-forward"
                    primary
                    onPress={confirmList}
                  />
                </View>
              </View>
            ) : null}

            {stage === "address" ? (
              <View style={styles.chips}>
                {addresses.map((a) => (
                  <Chip
                    key={a.id}
                    label={a.label}
                    icon="location-outline"
                    onPress={() => chooseAddress(a)}
                  />
                ))}
                <Chip
                  label={addresses.length === 0 ? "Add an address" : "New address"}
                  icon="add"
                  onPress={() => router.push("/customer/addresses")}
                />
              </View>
            ) : null}

            {stage === "confirm" && address ? (
              <View style={[styles.card, styles.panel]}>
                <ListSummary stops={stops} />
                <View style={[styles.row, styles.divider]}>
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={colors.secondary}
                  />
                  <Text style={[type.caption, styles.flex]} numberOfLines={2}>
                    {address.label} · {address.address}
                    {address.barangay ? `, ${address.barangay}` : ""}
                  </Text>
                </View>
                {note ? (
                  <View style={styles.row}>
                    <Ionicons
                      name="chatbox-outline"
                      size={16}
                      color={colors.secondary}
                    />
                    <Text style={[type.caption, styles.flex]}>{note}</Text>
                  </View>
                ) : null}
                <View style={[styles.divider, styles.summaryRows]}>
                  <SummaryRow label="Items" value="Receipt total" />
                  <SummaryRow label="Delivery fee" value="Same as a food order" />
                  {extraStores > 0 ? (
                    <SummaryRow
                      label={`Extra stores (${stops.length - 1})`}
                      value={peso(extraStores)}
                    />
                  ) : null}
                  <Text style={type.caption}>
                    Pay in cash when it arrives. Riders buy up to{" "}
                    {peso(PABAKAL_RULES.maxCost)} per pabakal.
                  </Text>
                </View>
                <MerchantButton
                  label="Send pabakal"
                  onPress={placeIt}
                  busy={send.isPending}
                />
                <Pressable
                  onPress={() => {
                    setStage("items");
                    setEditing(true);
                  }}
                  accessibilityRole="button"
                  style={styles.centerSelf}
                >
                  <Text style={styles.linkSmall}>Change the list</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.inputBar,
              // The tab bar hides while the keyboard is up, and the keyboard
              // covers the home indicator, so the bar sits right on it.
              { marginBottom: keyboardUp ? 0 : tabInset || insets.bottom },
            ]}
          >
            <TextInput
              style={styles.chatInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={
                stage === "confirm"
                  ? "Note for the rider (optional)…"
                  : "Type what to buy and where…"
              }
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={500}
              accessibilityLabel={
                stage === "confirm" ? "Note for the rider" : "What to buy and where"
              }
            />
            <Pressable
              onPress={() => void submitDraft()}
              disabled={!draft.trim() || reading}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={[styles.sendBtn, (!draft.trim() || reading) && styles.dim]}
            >
              <Ionicons name="send" size={18} color={colors.textInverse} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
      <StatusBar style="dark" />
    </View>
  );
}

function ChatBubble({
  from,
  text,
  typing = false,
}: {
  from: Bubble["from"];
  text: string;
  typing?: boolean;
}) {
  const mineSide = from === "me";
  return (
    <View style={[styles.bubbleRow, mineSide && styles.bubbleRowMine]}>
      {mineSide ? null : (
        <View style={styles.avatar}>
          <Ionicons name="basket" size={14} color={colors.textInverse} />
        </View>
      )}
      <View style={[styles.bubble, mineSide ? styles.bubbleMine : styles.bubbleKfd]}>
        {typing ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={[type.body, mineSide && styles.bubbleMineText]}>{text}</Text>
        )}
      </View>
    </View>
  );
}

function Chip({
  label,
  icon,
  primary = false,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, primary && styles.chipPrimary]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={primary ? colors.textInverse : colors.primary}
      />
      <Text style={[styles.chipLabel, primary && styles.chipLabelPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The list as KFD read it, store by store. */
function ListSummary({ stops }: { stops: StopDraft[] }) {
  return (
    <View style={[styles.card, styles.listCard]}>
      {stops.map((stop, i) => (
        <View key={i} style={[styles.stopSummary, i > 0 && styles.divider]}>
          <View style={styles.row}>
            <Ionicons name="storefront-outline" size={14} color={colors.secondary} />
            <Text style={[styles.strong, !stop.store.trim() && styles.missing]}>
              {stop.store.trim() || "Which store?"}
            </Text>
          </View>
          {stop.items.map((item, j) => (
            <Text key={j} style={[type.body, styles.indent]}>
              {item.quantity.trim() ? `${item.quantity}× ` : "?× "}
              {item.name}
            </Text>
          ))}
        </View>
      ))}
    </View>
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
  linkSmall: { ...type.label, color: colors.primary },

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

  noteInput: {
    minHeight: 56,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
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
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatarLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  centerSelf: { alignSelf: "center" },
  mineList: { padding: spacing.lg, gap: spacing.sm },
  chat: { padding: spacing.lg, gap: spacing.sm },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  bubbleRowMine: { justifyContent: "flex-end" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleKfd: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    ...shadow.card,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleMineText: { color: colors.textInverse },
  panel: { marginLeft: 36, gap: spacing.sm },
  listCard: { marginBottom: 0 },
  missing: { color: colors.danger },
  summaryRows: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginLeft: 36 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipPrimary: { backgroundColor: colors.primary },
  chipLabel: { ...type.label, color: colors.primary },
  chipLabelPrimary: { color: colors.textInverse },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
