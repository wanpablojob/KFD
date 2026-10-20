import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Ask camera or gallery, then pick one photo, cropped and compressed for
 * upload over mobile data. Resolves the local uri, or null if cancelled; an
 * error message is returned instead of thrown so callers just show it.
 */
export function pickPhoto(
  title: string,
  hint: string,
  aspect: [number, number] = [1, 1]
): Promise<{ uri: string | null; error: string | null }> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect,
    quality: 0.6,
  };
  async function run(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        uri: null,
        error: fromCamera
          ? "Allow camera access to take a photo."
          : "Allow photo access to choose a picture.",
      };
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    return {
      uri: result.canceled ? null : (result.assets[0]?.uri ?? null),
      error: null,
    };
  }
  return new Promise((resolve) => {
    Alert.alert(title, hint, [
      { text: "Take photo", onPress: () => void run(true).then(resolve) },
      { text: "Choose from gallery", onPress: () => void run(false).then(resolve) },
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => resolve({ uri: null, error: null }),
      },
    ]);
  });
}
