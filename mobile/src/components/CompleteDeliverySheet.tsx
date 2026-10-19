import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { colors, radius, spacing, type } from "../lib/theme";
import {
  FIELD_MESSAGES,
  validateCompletion,
  type PaymentKind,
} from "../lib/delivery-proof";
import { CompletionError, completeDelivery } from "../lib/delivery-complete";

/**
 * The sheet that replaced a single "Yes, delivered" tap.
 *
 * Marking a delivery complete used to assert that it happened. Now it has to
 * show it: a photo always, the cash taken on a cash order, and the GCash
 * reference on a wallet order. Everything the server records is collected here,
 * so nothing is inferred after the fact.
 *
 * Kept in its own file because the rider screen was already carrying every
 * sheet inline, and this one is bigger than the screen's other two combined.
 */

export interface CompleteSheetOrder {
  /** Included so the screen can refresh the right order after a close. */
  id: string;
  reference: string;
  customer: string;
  restaurant: string;
  payment: PaymentKind;
  total: number;
}

interface Props {
  order: CompleteSheetOrder | null;
  riderId: string | null;
  onCancel: () => void;
  onDone: (result: {
    flagged: boolean;
    /** Null on a wallet order, where nothing was collected in cash. */
    cashRecorded: number | null;
    orderId: string;
  }) => void;
}

export function CompleteDeliverySheet({ order, riderId, onCancel, onDone }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cash, setCash] = useState("");
  const [reference, setReference] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The mismatch warning the rider has already seen; tapping Complete again on
  // the same warning records it. A changed amount produces a new warning.
  const [confirmedWarning, setConfirmedWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset on every open. Keeping the previous order's photo would attach one
  // delivery's evidence to the next, which is the exact failure this feature
  // exists to stop.
  const reset = () => {
    setPhotoUri(null);
    setCash("");
    setReference("");
    setFieldError(null);
    setSubmitError(null);
    setConfirmedWarning(null);
  };

  function close() {
    reset();
    onCancel();
  }

  async function takePhoto() {
    setFieldError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFieldError("Allow camera access to take a delivery photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      // Proof is evidence of arrival, not a photo shoot. A modest quality keeps
      // the upload small enough to finish on a weak connection at the door,
      // which is where this always happens.
      allowsEditing: false,
      cameraType: ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function submit() {
    if (!order || !riderId || submitting) return;
    setSubmitError(null);

    const check = validateCompletion({
      orderId: order.id,
      payment: order.payment,
      orderTotal: order.total,
      photoUri,
      cashCollected: cash,
      gcashReference: reference,
    });

    if (!check.ok) {
      setFieldError(FIELD_MESSAGES[check.error ?? "photo-required"]);
      return;
    }

    // A mismatch is confirmed rather than blocked, so the rider is told what is
    // about to be recorded before it is recorded.
    if (check.warning && check.warning !== confirmedWarning) {
      setFieldError(check.warning);
      setConfirmedWarning(check.warning);
      return;
    }

    setSubmitting(true);
    try {
      const result = await completeDelivery(riderId, {
        orderId: order.id,
        payment: order.payment,
        orderTotal: order.total,
        photoUri,
        cashCollected: cash,
        gcashReference: reference,
      });
      const flagged = result.flagged ?? false;
      const orderId = order.id;
      reset();
      onDone({ flagged, cashRecorded: result.cashRecorded, orderId });
    } catch (error) {
      setSubmitError(
        error instanceof CompletionError
          ? error.message
          : "Could not complete the delivery."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!order) return null;

  const needsCash = order.payment === "cash";
  const needsReference = order.payment === "e_wallet";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} accessibilityLabel="Dismiss" onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>Complete delivery</Text>
          <Text style={styles.sheetBody}>
            {order.reference} · {order.restaurant}. This records your fee and cannot be
            undone.
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Proof. Required on every order, cash or not. */}
            <Text style={styles.label}>Photo of the delivery</Text>
            {photoUri ? (
              <Pressable onPress={takePhoto}>
                <Image source={{ uri: photoUri }} style={styles.preview} />
                <Text style={styles.retake}>Tap to retake</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.photoButton} onPress={takePhoto}>
                <Text style={styles.photoButtonLabel}>Take photo</Text>
              </Pressable>
            )}

            {needsCash && (
              <>
                <Text style={styles.label}>Cash collected</Text>
                <View style={styles.collectRow}>
                  <Text style={styles.currency}>₱</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={cash}
                    onChangeText={setCash}
                    keyboardType="decimal-pad"
                    placeholder={order.total.toFixed(2)}
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="Cash collected"
                  />
                </View>
                <Text style={styles.hint}>
                  Order total is {order.total.toFixed(2)}. Enter what the customer
                  actually handed you — a different amount is saved and flagged, not
                  blocked.
                </Text>
              </>
            )}

            {needsReference && (
              <>
                <Text style={styles.label}>GCash reference</Text>
                <TextInput
                  style={styles.textInput}
                  value={reference}
                  onChangeText={setReference}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Optional — leave blank if you have none"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="GCash reference"
                />
                <Text style={styles.hint}>
                  The customer paid your GCash QR directly. Adding the reference lets an
                  operator settle a dispute later.
                </Text>
              </>
            )}

            {fieldError && <Text style={styles.warning}>{fieldError}</Text>}
            {submitError && <Text style={styles.error}>{submitError}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={close} disabled={submitting}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, submitting && styles.disabled]}
              onPress={submit}
              disabled={submitting || !riderId}
            >
              <Text style={styles.primaryLabel}>
                {submitting
                  ? "Uploading…"
                  : confirmedWarning
                    ? "Complete anyway"
                    : "Complete"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "92%",
  },
  sheetTitle: { ...type.title, fontSize: 18 },
  sheetBody: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  scroll: { marginTop: spacing.xs },
  scrollBody: { gap: spacing.xs, paddingBottom: spacing.sm },

  label: {
    ...type.label,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  photoButton: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  photoButtonLabel: { ...type.label, color: colors.primary },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  retake: {
    ...type.caption,
    color: colors.primary,
    textAlign: "right",
    marginTop: spacing.xs,
  },

  collectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  currency: { ...type.display, fontSize: 22, color: colors.textMuted },
  amountInput: {
    ...type.display,
    fontSize: 26,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.md,
  },
  textInput: {
    ...type.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hint: { ...type.caption, color: colors.textFaint, lineHeight: 16 },

  // A mismatch is reported here but never blocks the submit button: the
  // delivery has already physically happened.
  warning: {
    ...type.caption,
    color: colors.warning,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  error: { ...type.body, color: colors.danger, marginTop: spacing.xs },

  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryLabel: { ...type.label, color: colors.textMuted },
  primary: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryLabel: { ...type.label, color: colors.textInverse },
  disabled: { opacity: 0.6 },
});
