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
import { useSession } from "../lib/session-context";
import { pickPhoto } from "../lib/pick-photo";
import { photoOf, saveMyProfile, uploadAvatar } from "../lib/my-profile";
import { colors, radius, spacing, type } from "../lib/theme";

/**
 * The person's photo and name, with "Edit profile" to change both (0157).
 * Shared by the customer account and the rider profile.
 */
export function ProfileEditor({
  name,
  caption,
  onSaved,
}: {
  name: string;
  /** A line under the name, e.g. the email, or "City · vehicle". */
  caption?: string;
  onSaved?: () => void;
}) {
  const { user } = useSession();
  const photo = photoOf(user);
  // Only a photo they uploaded can be sent back; a Google photo stays as it is.
  const ownPhoto =
    typeof user?.user_metadata?.photo_url === "string"
      ? user.user_metadata.photo_url
      : null;

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [picked, setPicked] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = picked ?? (removePhoto ? null : photo);

  function start() {
    setDraftName(name);
    setPicked(null);
    setRemovePhoto(false);
    setError(null);
    setEditing(true);
  }

  async function choosePhoto() {
    const result = await pickPhoto("Profile photo", "Take a photo or choose one.");
    if (result.error) setError(result.error);
    else if (result.uri) {
      setPicked(result.uri);
      setRemovePhoto(false);
    }
  }

  async function save() {
    if (!user || saving) return;
    const trimmed = draftName.trim();
    if (trimmed.length < 2) {
      setError("Your name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const photoUrl = picked
        ? await uploadAvatar(user.id, picked)
        : removePhoto
          ? null
          : ownPhoto;
      await saveMyProfile(trimmed, photoUrl);
      setEditing(false);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={editing ? () => void choosePhoto() : undefined}
        disabled={!editing || saving}
        accessibilityRole={editing ? "button" : "image"}
        accessibilityLabel={
          editing ? "Change profile photo" : `${name}'s profile photo`
        }
      >
        {shown ? (
          <Image source={{ uri: shown }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.initialBox]}>
            <Text style={styles.initial}>
              {(draftName || name).charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {editing ? <Text style={styles.changePhoto}>Change photo</Text> : null}
      </Pressable>

      {editing ? (
        <View style={styles.form}>
          {shown && !picked && ownPhoto ? (
            <Pressable
              onPress={() => setRemovePhoto(true)}
              disabled={saving}
              hitSlop={8}
            >
              <Text style={styles.link}>Remove photo</Text>
            </Pressable>
          ) : null}
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="words"
            maxLength={60}
            editable={!saving}
            accessibilityLabel="Your name"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondary]}
              onPress={() => setEditing(false)}
              disabled={saving}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primary, saving && styles.disabled]}
              onPress={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryLabel}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={[type.title, styles.center]}>{name}</Text>
          {caption ? (
            <Text style={[type.caption, styles.center]}>{caption}</Text>
          ) : null}
          <Pressable onPress={start} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Edit profile</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.xs },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  initialBox: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontSize: 34, fontWeight: "800", color: colors.gold },
  changePhoto: {
    ...type.caption,
    color: colors.primary,
    textAlign: "center",
    marginTop: 4,
    fontWeight: "700",
  },
  center: { textAlign: "center" },
  form: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...type.body,
    color: colors.text,
  },
  link: { ...type.label, color: colors.primary, textAlign: "center", marginTop: 2 },
  error: { ...type.caption, color: colors.danger, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  primary: { backgroundColor: colors.primary },
  primaryLabel: { ...type.label, color: colors.textInverse },
  secondary: { borderWidth: 1, borderColor: colors.border },
  secondaryLabel: { ...type.label, color: colors.text },
  disabled: { opacity: 0.6 },
});
