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
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useMyRiderApplication, useSubmitRiderApplication } from "../lib/hooks";
import { colors, radius, spacing, type } from "../lib/theme";

const VEHICLES = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "scooter", label: "Scooter" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
] as const;

type VehicleType = (typeof VEHICLES)[number]["value"];

function Field({
  label,
  ...inputProps
}: {
  label: string;
} & Omit<
  React.ComponentProps<typeof TextInput>,
  "style" | "placeholderTextColor" | "onFocus" | "onBlur"
>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>
        {label}
      </Text>
      <TextInput
        {...inputProps}
        style={[styles.input, focused && styles.inputFocused]}
        placeholderTextColor={colors.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

/**
 * Rider application (migration 0046).
 *
 * The flow is deliberately one-way: apply, then wait. Submitting does not make
 * anybody a rider, so this screen cannot promise an outcome, only that the
 * application is in the queue. Once it is in, the form is replaced by a status
 * panel rather than kept editable -- re-applying while pending would be
 * rejected server-side anyway, and showing a live form invites a confusing
 * error instead of an explanation.
 *
 * Reachable from the customer account area, so the applicant already has an
 * auth identity. submit_rider_application() refuses anyone who is already a
 * rider, which is what stops a signed-in rider from seeing this at all.
 */
export function RiderApplyScreen() {
  const router = useRouter();
  const { data: application, isLoading } = useMyRiderApplication();
  const submit = useSubmitRiderApplication();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>("motorcycle");
  const [licenceRef, setLicenceRef] = useState("");
  const [orcrRef, setOrcrRef] = useState("");
  const [governmentIdRef, setGovernmentIdRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Rejected applicants get the form back. The server has always allowed this --
  // submit_rider_application only refuses a pending row or an existing rider --
  // but the screen showed a status panel with one "Back" button, so a declined
  // rider was stuck permanently with no way to fix whatever the note flagged.
  const [reapplying, setReapplying] = useState(false);

  async function handleSubmit() {
    if (submit.isPending) return;
    setError(null);

    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (!phone.trim()) {
      setError("Enter a contact number.");
      return;
    }

    try {
      await submit.mutateAsync({
        fullName: fullName.trim(),
        phone: phone.trim(),
        city: city.trim() || null,
        vehicle,
        licenceRef: licenceRef.trim() || null,
        orcrRef: orcrRef.trim() || null,
        governmentIdRef: governmentIdRef.trim() || null,
      });
      // Back to the status panel, which now shows the new pending row.
      setReapplying(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send your application."
      );
    }
  }

  /**
   * Reopen the form on a rejected application, carrying the previous answers
   * across. Most rejections are about one field, and the note usually names it,
   * so retyping a whole application to change a licence number is the kind of
   * friction that ends an application rather than fixes it.
   */
  function startReapply() {
    if (!application) return;
    setFullName(application.fullName ?? "");
    setPhone(application.phone ?? "");
    setCity(application.city ?? "");
    setVehicle(application.vehicle ?? "motorcycle");
    setLicenceRef(application.licenceRef ?? "");
    setOrcrRef(application.orcrRef ?? "");
    setGovernmentIdRef(application.governmentIdRef ?? "");
    setError(null);
    setReapplying(true);
  }

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Already applied. The status panel is the whole screen from here -- except
  // for a rejected application the applicant has chosen to answer again, where
  // the form comes back. Pending stays locked because a second pending row is
  // refused server-side, and approved has no reason to apply again.
  const showStatus = application && !(reapplying && application.status === "rejected");
  if (showStatus) {
    return (
      <View style={styles.container}>
        <View style={styles.statusFrame}>
          <Text style={styles.statusEyebrow}>APPLICATION</Text>
          <Text style={styles.statusTitle}>
            {application.status === "pending"
              ? "Under review"
              : application.status === "approved"
                ? "You are a rider"
                : "Not approved"}
          </Text>
          <Text style={styles.statusBody}>
            {application.status === "pending"
              ? "We are checking your details. You will be able to sign in to the rider app once an admin approves it."
              : application.status === "approved"
                ? "Your rider account is ready. Open the rider app and turn on your availability when you want to start taking deliveries."
                : "Your application was declined."}
          </Text>

          {application.status === "rejected" ? (
            <Text style={styles.statusHint}>
              You can send a new application. Your previous answers are kept below so
              you only need to change what the note asks for.
            </Text>
          ) : null}

          {application.decisionNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>NOTE FROM THE TEAM</Text>
              <Text style={styles.noteBody}>{application.decisionNote}</Text>
            </View>
          ) : null}

          <View style={styles.summaryBox}>
            <Text style={styles.summaryLine}>
              {application.fullName} · {application.vehicle}
            </Text>
            <Text style={styles.summaryLineMuted}>
              {application.phone} · {application.city}
            </Text>
            {application.licenceRef ||
            application.orcrRef ||
            application.governmentIdRef ? (
              <Text style={styles.summaryLineMuted}>
                {[
                  application.licenceRef && `Licence ${application.licenceRef}`,
                  application.orcrRef && `ORCR ${application.orcrRef}`,
                  application.governmentIdRef && `ID ${application.governmentIdRef}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </View>

          {application.status === "rejected" ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={startReapply}
            >
              <Text style={styles.buttonLabel}>Apply again</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.buttonGhost,
              pressed && styles.buttonGhostPressed,
            ]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonGhostLabel}>Back</Text>
          </Pressable>
        </View>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.frame}>
          <View>
            <Text style={styles.title}>Apply to deliver</Text>
            <Text style={styles.subtitle}>
              Tell us how you will deliver. An admin reviews every application before
              you can take orders.
            </Text>
          </View>

          <Field
            label="FULL NAME"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            placeholder="Juan Dela Cruz"
          />
          <Field
            label="CONTACT NUMBER"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="09171234567"
          />
          <Field
            label="CITY"
            value={city}
            onChangeText={setCity}
            placeholder="Kabankalan City Proper"
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VEHICLE</Text>
            <View style={styles.chipRow}>
              {VEHICLES.map((v) => (
                <Pressable
                  key={v.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: vehicle === v.value }}
                  style={[styles.chip, vehicle === v.value && styles.chipSelected]}
                  onPress={() => setVehicle(v.value)}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      vehicle === v.value && styles.chipLabelSelected,
                    ]}
                  >
                    {v.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={styles.optionalHeading}>Documents (optional for now)</Text>
          <Field
            label="LICENCE NUMBER"
            value={licenceRef}
            onChangeText={setLicenceRef}
            placeholder="LIC-12345"
            autoCapitalize="characters"
          />
          <Field
            label="ORCR"
            value={orcrRef}
            onChangeText={setOrcrRef}
            placeholder="ORCR-0000"
            autoCapitalize="characters"
          />
          <Field
            label="GOVERNMENT ID"
            value={governmentIdRef}
            onChangeText={setGovernmentIdRef}
            placeholder="Any reference you can give the reviewer"
          />

          {error ? (
            <Text style={styles.error} role="alert">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={submit.isPending}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              submit.isPending && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
          >
            {submit.isPending ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.buttonLabel}>Send application</Text>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            Applying does not make you a rider yet, and you will not receive orders
            until you are approved and turn on your availability.
          </Text>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  scroll: { flexGrow: 1, justifyContent: "center", paddingVertical: spacing.xl },
  frame: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  title: { ...type.title, fontSize: 24 },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  field: { gap: 6 },
  fieldLabel: { ...type.eyebrow, color: colors.textFaint },
  fieldLabelFocused: { color: colors.secondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.secondary, backgroundColor: colors.card },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipLabel: { ...type.label, color: colors.textMuted },
  chipLabelSelected: { color: colors.primary },
  optionalHeading: { ...type.eyebrow, color: colors.textFaint, marginTop: spacing.sm },
  error: { ...type.body, color: colors.danger },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: spacing.sm,
  },
  buttonPressed: { backgroundColor: colors.primaryDark },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { fontSize: 16, fontWeight: "800", color: colors.textInverse },
  // Secondary action, so the primary "Apply again" stays the obvious one.
  buttonGhost: {
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: spacing.xs,
  },
  buttonGhostPressed: { backgroundColor: colors.surface },
  buttonGhostLabel: { fontSize: 16, fontWeight: "700", color: colors.primary },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  statusHint: { ...type.caption, color: colors.textMuted, lineHeight: 17 },
  statusFrame: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  statusEyebrow: { ...type.eyebrow, color: colors.textFaint },
  statusTitle: { ...type.title, fontSize: 24 },
  statusBody: { ...type.body, color: colors.textMuted },
  noteBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  noteLabel: { ...type.eyebrow, color: colors.textFaint },
  noteBody: { ...type.body, color: colors.text },
  summaryBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: 2,
  },
  summaryLine: { ...type.label, color: colors.text },
  summaryLineMuted: { ...type.caption, color: colors.textMuted },
});
