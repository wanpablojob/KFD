import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  MerchantButton,
  MerchantScreen,
  MerchantSection,
  ui,
} from "../../components/MerchantUi";
import { useSession } from "../../lib/session-context";
import { supabase } from "../../lib/supabase";
import { openLegal } from "../../lib/legal";
import {
  useSaveStoreStatus,
  useSetShopImage,
  useStoreStatus,
} from "../../lib/merchant";
import { pickPhoto } from "../../lib/pick-photo";
import {
  disablePush,
  enablePush,
  getPushStatus,
  watchForTokenRotation,
  type PushStatus,
} from "../../lib/push";
import { shouldUnregisterOnSignOut } from "../../lib/push-signout";
import { colors, radius, spacing, type } from "../../lib/theme";

/** merchant_set_store_status accepts 5 to 120 minutes (0077). */
const PREP_MIN = 5;
const PREP_MAX = 120;
const PREP_STEP = 5;

export default function MerchantAccountScreen() {
  const { user, role, leave } = useSession();
  const restaurantId = role?.restaurantId ?? null;
  const store = useStoreStatus(restaurantId);
  const saveStore = useSaveStoreStatus(restaurantId);
  const [push, setPush] = useState<PushStatus>({ granted: false, registered: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getPushStatus().then(setPush);
  }, [user]);

  // Re-register a rotated Expo token in place so alerts do not silently stop
  // after a reinstall or a permission change.
  useEffect(() => {
    if (!push.registered) return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session?.access_token) return;
      subscription = watchForTokenRotation(session.access_token, () => {
        if (active) setPush({ granted: true, registered: true });
      });
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [push.registered]);

  async function togglePush() {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      if (push.granted && push.registered) {
        await disablePush(token);
        setPush({ granted: false, registered: false });
      } else {
        setPush(await enablePush(token));
      }
    } catch (cause) {
      setPush({
        granted: false,
        registered: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Alerts could not be changed. Try again.",
      });
    } finally {
      setPushBusy(false);
    }
  }

  // Keyed on `registered`: the server may still hold this device's token even
  // when the OS permission was turned off, and the next account to sign in
  // here must not receive this restaurant's orders. See lib/push-signout.ts.
  async function signOut() {
    if (user && shouldUnregisterOnSignOut(push)) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token)
        await disablePush(session.access_token).catch(() => {});
    }
    leave();
  }

  const current = store.data;
  const setPhoto = useSetShopImage(restaurantId);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function changePhoto() {
    setPhotoError(null);
    const picked = await pickPhoto(
      "Shop photo",
      "A wide photo of your shop or best dish.",
      [16, 9]
    );
    if (picked.error) return setPhotoError(picked.error);
    if (!picked.uri) return;
    setPhoto.mutate(picked.uri, {
      onError: (cause) =>
        setPhotoError(
          cause instanceof Error ? cause.message : "Could not save the photo."
        ),
    });
  }
  const prep = current?.prepMinutes ?? 20;
  const savePrep = (next: number) =>
    current &&
    saveStore.mutate({
      isOpen: current.isOpen,
      prepMinutes: Math.min(PREP_MAX, Math.max(PREP_MIN, next)),
    });

  return (
    <MerchantScreen
      title={role?.restaurantName ?? "Account"}
      subtitle={user?.email ?? undefined}
    >
      <MerchantSection label="Shop photo">
        <Pressable
          onPress={() => void changePhoto()}
          disabled={setPhoto.isPending}
          style={styles.photo}
          accessibilityRole="button"
          accessibilityLabel={
            current?.imageUrl ? "Change shop photo" : "Add shop photo"
          }
        >
          {current?.imageUrl ? (
            <Image source={{ uri: current.imageUrl }} style={styles.photoImage} />
          ) : (
            <Text style={ui.muted}>
              {setPhoto.isPending
                ? "Uploading…"
                : "Tap to add a photo of your shop or best dish"}
            </Text>
          )}
        </Pressable>
        <Text style={ui.muted}>
          {setPhoto.isPending
            ? "Uploading…"
            : "Customers see this on your card in Home and Shops, and on your menu."}
        </Text>
        {photoError ? <Text style={ui.error}>{photoError}</Text> : null}
      </MerchantSection>

      <MerchantSection label="Store">
        {store.isError ? (
          <Text style={ui.error}>Could not load your store status.</Text>
        ) : null}
        {current ? (
          <>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={type.heading}>
                  {current.isOpen ? "Taking orders" : "Closed"}
                </Text>
                <Text style={ui.muted}>
                  {current.isOpen
                    ? "Customers can order from you now."
                    : "Customers cannot order until you open."}
                </Text>
              </View>
              <Switch
                value={current.isOpen}
                disabled={saveStore.isPending}
                onValueChange={(isOpen) =>
                  saveStore.mutate({
                    isOpen,
                    prepMinutes: prep,
                  })
                }
                trackColor={{ true: colors.primary, false: colors.border }}
                accessibilityLabel="Store open"
              />
            </View>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={type.heading}>Prep time</Text>
                <Text style={ui.muted}>
                  Shown to customers as part of the delivery estimate.
                </Text>
              </View>
              <View style={styles.stepper}>
                <MerchantButton
                  label="−"
                  tone="outline"
                  disabled={prep <= PREP_MIN || saveStore.isPending}
                  onPress={() => savePrep(prep - PREP_STEP)}
                />
                <Text style={styles.prep}>{prep} min</Text>
                <MerchantButton
                  label="+"
                  tone="outline"
                  disabled={prep >= PREP_MAX || saveStore.isPending}
                  onPress={() => savePrep(prep + PREP_STEP)}
                />
              </View>
            </View>
            {saveStore.isError ? (
              <Text style={ui.error}>That change was not saved. Try again.</Text>
            ) : null}
          </>
        ) : null}
      </MerchantSection>

      <MerchantSection label="Order alerts">
        <View style={styles.row}>
          <Text style={[ui.muted, styles.copy]}>
            {push.error
              ? push.error
              : push.granted && push.registered
                ? "This phone buzzes for every new order."
                : "Get an alert on this phone when an order comes in."}
          </Text>
          <Switch
            value={push.granted && push.registered}
            onValueChange={() => void togglePush()}
            disabled={pushBusy}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Order alerts"
          />
        </View>
      </MerchantSection>

      <MerchantSection label="More">
        <Text style={ui.muted}>
          Add menu items, change prices and download sales on the KFD web portal.
        </Text>
        <View style={styles.links}>
          <Pressable onPress={() => openLegal("support")} accessibilityRole="link">
            <Text style={styles.link}>Help & support</Text>
          </Pressable>
          <Pressable onPress={() => openLegal("privacy")} accessibilityRole="link">
            <Text style={styles.link}>Privacy</Text>
          </Pressable>
          <Pressable onPress={() => openLegal("terms")} accessibilityRole="link">
            <Text style={styles.link}>Terms</Text>
          </Pressable>
        </View>
      </MerchantSection>

      <View style={styles.signOut}>
        <MerchantButton label="Sign out" tone="danger" onPress={() => void signOut()} />
      </View>
    </MerchantScreen>
  );
}

const styles = StyleSheet.create({
  photo: {
    height: 150,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
  },
  photoImage: { width: "100%", height: "100%" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  copy: { flex: 1, gap: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm, width: 150 },
  prep: { ...type.label, minWidth: 48, textAlign: "center" },
  links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  link: { ...type.caption, color: colors.primary, fontWeight: "700" },
  signOut: { flexDirection: "row" },
});
