import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { MerchantButton, ui } from "./MerchantUi";
import {
  uploadMenuImage,
  type MenuItemInput,
  type MerchantMenuItem,
} from "../lib/merchant";
import { parsePrice } from "../lib/merchant-logic";
import { colors, radius, spacing, type } from "../lib/theme";

/** Square, compressed: a menu thumbnail, not a print. Keeps uploads small on mobile data. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.6,
};

/**
 * Add or edit one menu item. `item` null opens it empty for a new item;
 * `visible` false keeps it closed. The photo is uploaded on Save, not on pick,
 * so cancelling never leaves an orphan upload behind.
 */
export function MenuItemEditor({
  visible,
  item,
  restaurantId,
  categories,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  item: MerchantMenuItem | null;
  restaurantId: string | null;
  categories: string[];
  saving: boolean;
  onSave: (input: MenuItemInput) => Promise<void>;
  onDelete: (() => void) | null;
  onClose: () => void;
}) {
  // Seeded from the item once: the Menu screen mounts a fresh editor (keyed by
  // item) each time it opens, so there is no stale state to reset.
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? categories[0] ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [available, setAvailable] = useState(item?.available ?? true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pick(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        fromCamera
          ? "Allow camera access to take a photo."
          : "Allow photo access to choose a picture."
      );
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function choosePhoto() {
    Alert.alert("Menu photo", "Use a clear photo of the dish.", [
      { text: "Take photo", onPress: () => void pick(true) },
      { text: "Choose from gallery", onPress: () => void pick(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function save() {
    const parsed = parsePrice(price);
    if (!name.trim()) return setError("Give the item a name.");
    if (parsed === null) return setError("Enter the price in pesos, for example 120.");
    if (!restaurantId)
      return setError("Your account is not attached to a restaurant yet.");
    setError(null);
    try {
      let imageUrl = item?.imageUrl ?? null;
      if (photoUri) {
        setUploading(true);
        imageUrl = await uploadMenuImage(restaurantId, photoUri);
      }
      await onSave({ name, category, price: parsed, available, imageUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the item.");
    } finally {
      setUploading(false);
    }
  }

  const preview = photoUri ?? item?.imageUrl ?? null;
  const busy = saving || uploading;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={type.title}>{item ? "Edit item" : "New menu item"}</Text>

            <Pressable
              onPress={choosePhoto}
              style={styles.photo}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
            >
              {preview ? (
                <Image source={{ uri: preview }} style={styles.photoImage} />
              ) : (
                <Text style={ui.muted}>Tap to add a photo</Text>
              )}
            </Pressable>
            {preview ? (
              <Text style={[ui.muted, styles.center]}>Tap the photo to change it.</Text>
            ) : null}

            <Field
              label="NAME"
              value={name}
              onChangeText={setName}
              placeholder="Chicken Inasal"
            />
            <Field
              label="CATEGORY"
              value={category}
              onChangeText={setCategory}
              placeholder="Mains"
            />
            {categories.length > 0 ? (
              <View style={styles.chips}>
                {categories.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, category === c && styles.chipOn]}
                  >
                    <Text
                      style={[styles.chipLabel, category === c && styles.chipLabelOn]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Field
              label="PRICE (₱)"
              value={price}
              onChangeText={setPrice}
              placeholder="120"
              keyboardType="decimal-pad"
            />

            <View style={styles.row}>
              <Text style={[ui.body, styles.flex]}>Available to order</Text>
              <Switch
                value={available}
                onValueChange={setAvailable}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            {error ? <Text style={ui.error}>{error}</Text> : null}

            <View style={styles.row}>
              <MerchantButton
                label="Cancel"
                tone="outline"
                disabled={busy}
                onPress={onClose}
              />
              <MerchantButton
                label={uploading ? "Uploading…" : "Save"}
                busy={busy}
                onPress={() => void save()}
              />
            </View>
            {onDelete ? (
              <Pressable
                disabled={busy}
                onPress={() =>
                  Alert.alert("Delete this item?", "Customers will no longer see it.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: onDelete },
                  ])
                }
              >
                <Text style={styles.delete}>Delete item</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  ...props
}: { label: string } & Omit<
  React.ComponentProps<typeof TextInput>,
  "style" | "placeholderTextColor"
>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={colors.textFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  photo: {
    alignSelf: "center",
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: { width: "100%", height: "100%" },
  center: { textAlign: "center" },
  field: { gap: 6 },
  fieldLabel: { ...type.eyebrow, color: colors.textFaint },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { ...type.caption, color: colors.text },
  chipLabelOn: { color: colors.textInverse, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  delete: {
    ...type.label,
    color: colors.danger,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
