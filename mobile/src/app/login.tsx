import { router } from "expo-router";
import { LoginScreen } from "../screens/login-screen";

export default function LoginRoute() {
  return <LoginScreen onBack={() => router.back()} />;
}
