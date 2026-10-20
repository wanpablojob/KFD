import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useTrackOrder,
  useOrderRiderPayment,
  useRiderContact,
  useReportDeliveryIssue,
} from "../lib/hooks";
import { orderProgress, type ProgressStep } from "../lib/order-progress";
import { deliveryWindow, formatWindow } from "../lib/delivery-estimate";
import type { TrackedOrder, RiderPayment, RiderContact } from "../lib/storefront";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

const STATUS_LABEL: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Public order tracking, mirroring the web page: track_order(reference) with the
 * anon key, no session. The function returns a fixed projection, so this screen
 * never touches the orders table directly.
 *
 * Live while the order is moving: useTrackOrder polls every 15s and refetches on
 * foreground, and stops once the status is terminal, so the customer sees a
 * status move instead of a snapshot that was true when they opened the page.
 */
export function TrackOrderScreen({
  onBack,
  initialReference,
}: {
  onBack: () => void;
  initialReference?: string;
}) {
  const insets = useSafeAreaInsets();
  const [reference, setReference] = useState(initialReference ?? "");
  // The reference actually being tracked. Kept separate from the input so
  // typing a new one does not fire a request on every keystroke.
  const [submitted, setSubmitted] = useState((initialReference ?? "").trim());
  const [inputError, setInputError] = useState<string | null>(null);

  const enabled = submitted.length > 0;
  const {
    data: order,
    isLoading,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
  } = useTrackOrder(submitted, enabled);

  // The assigned rider's GCash QR, only for an e_wallet order. The server
  // returns it only to the order's own customer, so others see no block.
  const { data: riderPayment } = useOrderRiderPayment(
    submitted,
    enabled && order?.payment === "e_wallet"
  );

  // 0078: the rider's phone, for the order's own customer while it is under way.
  const { data: riderContact } = useRiderContact(
    submitted,
    enabled &&
      !!order &&
      ["confirmed", "preparing", "out_for_delivery"].includes(order.status)
  );

  // 0075: report a problem with a delivery. Held here rather than in OrderCard
  // so the dismissed state survives a status poll re-rendering the card.
  const reporting = useReportDeliveryIssue(submitted);
  const [reportingOpen, setReportingOpen] = useState(false);
  const [reported, setReported] = useState(false);

  async function submitReport(reason: string) {
    try {
      await reporting.mutateAsync(reason);
      setReported(true);
      setReportingOpen(false);
    } catch {
      // The mutation's error is rendered below the form; leaving it open keeps
      // the customer's words so they can retry rather than retyping.
    }
  }

  function track() {
    const ref = reference.trim();
    if (!ref) {
      setInputError("Enter the reference from your receipt.");
      return;
    }
    setInputError(null);
    setSubmitted(ref);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: spacing.lg + insets.top }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.title}>Track your order</Text>
          <Text style={styles.subtitle}>
            Enter the reference from your receipt, e.g. #KFD-1A2B3C4D5E6F.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="Reference (#KFD-…)"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isLoading}
          onSubmitEditing={track}
          returnKeyType="go"
        />

        {inputError ? <Text style={styles.error}>{inputError}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            shadow.card,
            isLoading ? styles.buttonDisabled : null,
            pressed && !isLoading ? styles.buttonPressed : null,
          ]}
          disabled={isLoading}
          onPress={track}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonLabel}>Track order</Text>
          )}
        </Pressable>

        {enabled && isLoading ? (
          <Text style={styles.statusNote}>Looking up your order…</Text>
        ) : null}

        {enabled && isError ? (
          <Text style={styles.error}>
            {error instanceof Error ? error.message : "Tracking failed. Try again."}
          </Text>
        ) : null}

        {enabled && !isLoading && !isError && order === null ? (
          <Text style={styles.statusNote}>No order found with that reference.</Text>
        ) : null}

        {order ? (
          <OrderCard
            order={order}
            updatedAt={dataUpdatedAt}
            refreshing={isFetching}
            riderPayment={riderPayment ?? null}
            riderContact={riderContact ?? null}
            reporting={{
              open: reportingOpen,
              busy: reporting.isPending,
              error: reporting.error instanceof Error ? reporting.error.message : null,
              done: reported,
              onOpen: () => setReportingOpen(true),
              onClose: () => setReportingOpen(false),
              onSubmit: submitReport,
            }}
          />
        ) : null}
      </ScrollView>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

/**
 * The 24-hour recovery window, from the customer's side (0075).
 *
 * Only on a delivered order, because that is the only state with a payout to
 * dispute. Deliberately plain text rather than a modal: the customer has just
 * told us the food did not arrive and wants a way to say so, not a flow.
 *
 * Does not promise a refund. The rider's payout is what is under review, and the
 * customer is not party to that decision, so the wording says an admin will look
 * into the delivery and nothing about money coming back.
 */
function ReportProblem({
  order,
  reporting,
}: {
  order: TrackedOrder;
  reporting: {
    open: boolean;
    busy: boolean;
    error: string | null;
    done: boolean;
    onOpen: () => void;
    onClose: () => void;
    onSubmit: (reason: string) => void;
  };
}) {
  const [reason, setReason] = useState("");

  if (reporting.done) {
    return (
      <View style={styles.reportBlock}>
        <Text style={styles.reportDone}>
          Reported. An admin will look into this delivery and follow up.
        </Text>
      </View>
    );
  }

  if (!reporting.open) {
    return (
      <View style={styles.reportBlock}>
        <Text style={styles.reportIntro}>
          {order.status === "delivered" ? "Wrong order, or it never arrived?" : null}
        </Text>
        {order.status === "delivered" ? (
          <Text
            style={styles.reportLink}
            onPress={reporting.onOpen}
            accessibilityRole="button"
          >
            Report a problem with this delivery
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.reportBlock}>
      <Text style={styles.reportIntro}>
        Tell us what went wrong. An admin reads this and follows up — you will not be
        charged for anything.
      </Text>
      <TextInput
        style={styles.reportInput}
        value={reason}
        onChangeText={setReason}
        placeholder="The food never arrived."
        placeholderTextColor={colors.textFaint}
        multiline
        editable={!reporting.busy}
      />
      {reporting.error ? (
        <Text style={styles.reportError}>{reporting.error}</Text>
      ) : null}
      <View style={styles.reportActions}>
        <Text
          style={styles.reportCancel}
          onPress={reporting.onClose}
          disabled={reporting.busy}
        >
          Cancel
        </Text>
        <Text
          style={[styles.reportSubmit, reporting.busy && styles.reportSubmitBusy]}
          onPress={() => reporting.onSubmit(reason.trim())}
          disabled={reporting.busy || reason.trim().length === 0}
        >
          {reporting.busy ? "Sending…" : "Send report"}
        </Text>
      </View>
    </View>
  );
}

function OrderCard({
  order,
  updatedAt,
  refreshing,
  riderPayment,
  riderContact,
  reporting,
}: {
  order: TrackedOrder;
  updatedAt: number;
  refreshing: boolean;
  riderPayment: RiderPayment | null;
  riderContact: RiderContact | null;
  reporting: {
    open: boolean;
    busy: boolean;
    error: string | null;
    done: boolean;
    onOpen: () => void;
    onClose: () => void;
    onSubmit: (reason: string) => void;
  };
}) {
  const cancelled = order.status === "cancelled";
  const steps = orderProgress(order.status);
  const eta = deliveryWindow(order.placed_at, order.prep_minutes, order.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardRef}>{order.reference}</Text>
        <View
          style={[
            styles.status,
            cancelled && styles.statusCancelled,
            order.status === "delivered" && styles.statusDelivered,
          ]}
        >
          <Text
            style={[
              styles.statusLabel,
              cancelled && styles.statusLabelCancelled,
              order.status === "delivered" && styles.statusLabelDelivered,
            ]}
          >
            {STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      {/* Cancelled is an outcome, not a step, so it gets its own note rather
          than a progression that would imply the order is still heading
          somewhere. */}
      {cancelled ? (
        <View style={styles.cancelledNote}>
          <Text style={styles.cancelledText}>
            This order was cancelled. If you paid, any refund is handled by the
            restaurant.
          </Text>
        </View>
      ) : (
        <OrderProgress steps={steps} />
      )}

      {eta ? <Text style={styles.eta}>Arriving around {formatWindow(eta)}</Text> : null}

      <Text style={styles.cardRestaurant}>{order.restaurant}</Text>

      <View style={styles.items}>
        {order.items.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.quantity}× {item.name}
            </Text>
            <Text style={styles.itemPrice}>
              ₱{(Number(item.price) * Number(item.quantity)).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {/* What the customer paid. The full breakdown now that track_order
          returns service_fee; the delivery address is returned only to the
          order's own customer, so it is shown only when the server sends it. */}
      <View style={styles.fees}>
        <FeeRow label="Subtotal" value={order.subtotal} />
        <FeeRow label="Delivery fee" value={order.delivery_fee} />
        <FeeRow label="Service fee" value={order.service_fee} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₱{Number(order.total).toFixed(2)}</Text>
        </View>
      </View>

      {order.delivery_address ? (
        <View style={styles.addressBlock}>
          <Text style={styles.addressLabel}>Deliver to</Text>
          <Text style={styles.addressValue}>{order.delivery_address}</Text>
        </View>
      ) : null}

      {/* GCash payment: the assigned rider's own QR. Server returns it only for
          an e_wallet order to its own customer, so anon/others get nothing. */}
      {riderPayment ? (
        <View style={styles.payBlock}>
          <Text style={styles.addressLabel}>Pay by GCash</Text>
          <Image
            source={{ uri: riderPayment.gcashQrUrl }}
            style={styles.qr}
            resizeMode="contain"
          />
          <Text style={styles.meta}>
            {riderPayment.gcashName
              ? `${riderPayment.gcashName} · rider ${riderPayment.riderName}`
              : `Rider ${riderPayment.riderName}`}
          </Text>
          <Text style={styles.meta}>
            Scan in GCash to send ₱{Number(order.total).toFixed(2)}.
          </Text>
        </View>
      ) : null}

      {riderContact?.riderPhone ? (
        <View style={styles.payBlock}>
          <Text style={styles.addressLabel}>Your rider</Text>
          <Text style={styles.meta}>{riderContact.riderName}</Text>
          <View style={styles.contactRow}>
            <Pressable
              style={styles.contactButton}
              onPress={() =>
                void Linking.openURL(`tel:${riderContact.riderPhone}`).catch(() => {})
              }
              accessibilityRole="button"
              accessibilityLabel={`Call ${riderContact.riderName}`}
            >
              <Text style={styles.contactLabel}>Call</Text>
            </Pressable>
            <Pressable
              style={styles.contactButton}
              onPress={() =>
                void Linking.openURL(`sms:${riderContact.riderPhone}`).catch(() => {})
              }
              accessibilityRole="button"
              accessibilityLabel={`Text ${riderContact.riderName}`}
            >
              <Text style={styles.contactLabel}>Text</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ReportProblem order={order} reporting={reporting} />

      <View style={styles.footer}>
        <Text style={styles.meta}>
          Placed {new Date(order.placed_at).toLocaleString()}
        </Text>
        <Text style={styles.meta}>
          {refreshing
            ? "Updating…"
            : `Updated ${new Date(updatedAt).toLocaleTimeString()}`}
        </Text>
      </View>
    </View>
  );
}

function OrderProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <View style={styles.progress}>
      {steps.map((step) => (
        <View key={step.status} style={styles.step}>
          <View
            style={[
              styles.dot,
              step.state === "done" && styles.dotDone,
              step.state === "current" && styles.dotCurrent,
            ]}
          />
          <Text
            style={[
              styles.stepLabel,
              step.state === "current" && styles.stepLabelCurrent,
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FeeRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.feeRow}>
      <Text style={styles.feeLabel}>{label}</Text>
      <Text style={styles.feeValue}>₱{Number(value).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    alignSelf: "flex-start",
  },
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  link: { ...type.label, color: colors.secondary },
  heading: { gap: 2, marginBottom: spacing.xs },
  title: { ...type.display },
  subtitle: { ...type.body, color: colors.textMuted },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { ...type.body, color: colors.danger, textAlign: "center" },
  statusNote: { ...type.body, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonLabel: { fontSize: 15, fontWeight: "800", color: colors.textInverse },
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardRef: { ...type.heading, color: colors.primary },
  contactRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  contactButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
  },
  contactLabel: { fontSize: 15, fontWeight: "800", color: colors.textInverse },
  eta: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  status: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  statusDelivered: { backgroundColor: colors.successSoft },
  statusCancelled: { backgroundColor: colors.dangerSoft },
  statusLabel: { fontSize: 11, fontWeight: "800", color: colors.warning },
  statusLabelDelivered: { color: colors.success },
  statusLabelCancelled: { color: colors.danger },

  progress: { gap: spacing.xs, marginTop: spacing.xs },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepLabel: { ...type.body, color: colors.textMuted },
  stepLabelCurrent: { color: colors.text, fontWeight: "700" },

  cancelledNote: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cancelledText: { ...type.caption, color: colors.danger },

  cardRestaurant: { ...type.body, color: colors.textMuted },
  items: { gap: 4, marginTop: 4 },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { ...type.body, color: colors.text },
  itemPrice: { ...type.body, color: colors.text },
  fees: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: 4,
    gap: 4,
  },
  feeRow: { flexDirection: "row", justifyContent: "space-between" },
  feeLabel: { ...type.body, color: colors.textMuted },
  feeValue: { ...type.body, color: colors.text },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  totalLabel: { ...type.body, fontWeight: "700" },
  totalValue: { ...type.price },
  addressBlock: { marginTop: spacing.sm, gap: 2 },
  addressLabel: {
    ...type.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  addressValue: { ...type.body, color: colors.text },
  payBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  qr: {
    width: 180,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignSelf: "center",
  },
  // 0075. Warning-toned, not destructive: the rider is still paid while the
  // dispute is open, and the customer is reporting a delivery, not hitting an
  // error screen.
  reportBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reportIntro: { ...type.caption, color: colors.textMuted, lineHeight: 17 },
  reportDone: { ...type.caption, color: colors.success, lineHeight: 17 },
  reportError: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
  reportInput: {
    ...type.body,
    marginTop: spacing.sm,
    minHeight: 72,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    textAlignVertical: "top",
  },
  reportActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  reportCancel: { ...type.label, color: colors.textMuted },
  reportSubmit: { ...type.label, color: colors.primary },
  reportSubmitBusy: { color: colors.textFaint },
  reportLink: { ...type.label, color: colors.primary, marginTop: spacing.sm },
  footer: { gap: 2, marginTop: spacing.xs },
  meta: { ...type.caption, color: colors.textFaint },
});
