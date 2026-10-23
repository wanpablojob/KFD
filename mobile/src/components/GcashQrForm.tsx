import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { pickPhoto } from "../lib/pick-photo";
import { uploadGcashQr } from "../lib/gcash-qr-upload";
import { GCASH_QR_BUCKET } from "../lib/gcash-qr";
import { removeReplacedImage } from "../lib/storage-cleanup";
import { useSetRiderGcash } from "../lib/hooks";
import { colors, radius, shadow, spacing, type } from "../lib/theme";
import { GcashQrModal } from "./GcashQrModal";

type Notice = { kind: "ok" | "error"; text: string };

/**
 * The rider's GCash payment handle: the QR the customer scans on an e_wallet
 * order.
 *
 * 0057 only offered a URL field, which assumed the rider had somewhere to host
 * the image. The picker below uploads a screenshot instead (0091); the existing
 * rider_set_gcash RPC still stores the resulting public URL and the account
 * name. The upload happens on Save, not on pick, so cancelling never leaves an
 * orphan in the bucket.
 */
export function GcashQrForm({
  riderId,
  initialUrl,
  initialName,
}: {
  riderId: string;
  initialUrl: string | null;
  initialName: string | null;
}) {
  const setGcash = useSetRiderGcash();
  const [url, setUrl] = useState((initialUrl ?? "").trim());
  const [name, setName] = useState(initialName ?? "");
  const [savedUrl, setSavedUrl] = useState((initialUrl ?? "").trim());
  const [savedName, setSavedName] = useState((initialName ?? "").trim());
  const [picked, setPicked] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // A picked local file wins so the rider sees what they chose before saving.
  // `removed` is separate from an empty `url` because removing is itself a
  // change that has to be saved to the server.
  const preview = picked ?? (removed ? null : url || null);
  const dirty =
    Boolean(picked) ||
    removed ||
    name.trim() !== savedName ||
    (!removed && !picked && url.trim() !== savedUrl);

  async function choose() {
    setNotice(null);
    const result = await pickPhoto(
      "GCash QR",
      "Choose a screenshot of your GCash QR. Customers paying you by GCash will see it."
    );
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    if (!result.uri) return;
    setPicked(result.uri);
    setRemoved(false);
  }

  function remove() {
    setPicked(null);
    setRemoved(true);
    setNotice(null);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const nextUrl = picked
        ? await uploadGcashQr(riderId, picked)
        : removed
          ? null
          : url.trim() || null;
      const nextName = name.trim() || null;

      await setGcash.mutateAsync({ qrUrl: nextUrl, name: nextName });
      // The QR it replaced is no longer anyone's (G9).
      void removeReplacedImage(GCASH_QR_BUCKET, savedUrl || null, nextUrl);

      setUrl(nextUrl ?? "");
      setSavedUrl(nextUrl ?? "");
      setSavedName(nextName ?? "");
      setPicked(null);
      setRemoved(false);
      setNotice({
        kind: "ok",
        text: "Saved. Customers paying by GCash will see this QR.",
      });
    } catch (cause) {
      setNotice({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Could not save.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>GCash payment</Text>
      <Text style={styles.copy}>
        Attach your GCash QR so customers can scan it when they pay. Screenshot the QR
        in GCash, then add it here — you will not need to open GCash at the door.
      </Text>

      <Pressable
        onPress={() => void choose()}
        style={styles.preview}
        accessibilityRole="button"
        accessibilityLabel={preview ? "Replace your GCash QR" : "Add your GCash QR"}
      >
        {preview ? (
          <Image
            source={{ uri: preview }}
            style={styles.previewImage}
            resizeMode="contain"
            accessibilityLabel="Your GCash QR"
          />
        ) : (
          <View style={styles.previewEmpty}>
            <Text style={styles.previewPlus}>＋</Text>
            <Text style={styles.previewLabel}>Add your GCash QR</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={styles.secondary}
          onPress={() => void choose()}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryLabel}>
            {preview ? "Replace image" : "Choose image"}
          </Text>
        </Pressable>
        {preview ? (
          <Pressable
            style={styles.secondary}
            onPress={() => setShowQr(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Show your GCash QR full screen"
          >
            <Text style={styles.secondaryLabel}>Show full screen</Text>
          </Pressable>
        ) : null}
        {preview ? (
          <Pressable
            style={styles.removeButton}
            onPress={remove}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.removeLabel}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      {preview ? <Text style={styles.hint}>Tap the image to replace it.</Text> : null}

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Name on your GCash account"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="GCash account name"
      />

      <Pressable
        style={[styles.save, (!dirty || busy) && styles.disabled]}
        disabled={!dirty || busy}
        onPress={() => void save()}
        accessibilityRole="button"
        accessibilityState={{ disabled: !dirty || busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveLabel}>Save GCash QR</Text>
        )}
      </Pressable>

      {notice ? (
        <Text
          style={[
            styles.notice,
            notice.kind === "error" ? styles.noticeError : styles.noticeOk,
          ]}
          accessibilityRole="alert"
        >
          {notice.text}
        </Text>
      ) : null}

      <GcashQrModal
        visible={showQr && Boolean(preview)}
        url={preview}
        name={name}
        onClose={() => setShowQr(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionLabel: { ...type.eyebrow, color: colors.secondary },
  copy: { ...type.caption, color: colors.textMuted },
  preview: {
    alignSelf: "center",
    width: 168,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  previewImage: { width: "100%", height: "100%" },
  previewEmpty: { alignItems: "center", gap: spacing.xs, padding: spacing.md },
  previewPlus: { fontSize: 34, color: colors.secondary, lineHeight: 38 },
  previewLabel: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  secondaryLabel: { ...type.label, color: colors.text },
  removeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  removeLabel: { ...type.label, color: colors.danger },
  hint: { ...type.caption, color: colors.textFaint },
  input: {
    ...type.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  save: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  saveLabel: { ...type.label, color: colors.textInverse, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  notice: { ...type.body },
  noticeOk: { color: colors.success },
  noticeError: { color: colors.danger },
});
