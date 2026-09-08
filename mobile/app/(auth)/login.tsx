import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";

import { useSession } from "@/store/session";
import { useTheme } from "@/theme/ThemeProvider";

type Stage = "credentials" | "2fa-setup" | "2fa-verify";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { resolved, toggle } = useTheme();
  const { login, verify2fa } = useSession();

  const [stage, setStage] = useState<Stage>("credentials");
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forceLogout, setForceLogout] = useState(false);

  const submitCreds = async () => {
    setBusy(true);
    setError("");
    const r = await login(workspace.trim(), email.trim(), password, forceLogout);
    setBusy(false);
    if (r.ok) return; // AuthGate navigates
    if ("needs2fa" in r) {
      setQr(r.qr);
      setStage(r.needs2fa === "setup" ? "2fa-setup" : "2fa-verify");
      return;
    }
    if (r.code === "SESSION_ACTIVE") {
      setForceLogout(true);
      setError("This account is signed in elsewhere. Tap Sign in again to take over.");
      return;
    }
    setError(r.error);
  };

  const submit2fa = async () => {
    setBusy(true);
    setError("");
    const r = await verify2fa(stage === "2fa-setup" ? "setup" : "verify", code.trim());
    setBusy(false);
    if (!r.ok && "error" in r) setError(r.error);
  };

  const fieldClass =
    "h-12 rounded-xl border border-border bg-surface-2 px-4 text-[15px] text-text";

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(300)} className="mb-8 items-center">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-brand">
              <Text className="text-2xl font-black text-white">R</Text>
            </View>
            <Text className="text-2xl font-extrabold tracking-tight text-text">ringNex</Text>
            <Text className="mt-1 text-sm text-muted">Sign in to your workspace</Text>
          </Animated.View>

          {error ? (
            <Animated.View entering={FadeInDown} className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
              <Text className="text-[13px] text-danger">{error}</Text>
            </Animated.View>
          ) : null}

          {stage === "credentials" ? (
            <Animated.View entering={FadeInDown.duration(280)} className="gap-3">
              <TextInput
                placeholder="Workspace"
                autoCapitalize="none"
                autoCorrect={false}
                value={workspace}
                onChangeText={setWorkspace}
                placeholderTextColor="#8293a0"
                className={fieldClass}
              />
              <TextInput
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                placeholderTextColor="#8293a0"
                className={fieldClass}
              />
              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholderTextColor="#8293a0"
                className={fieldClass}
              />
              <Pressable
                onPress={submitCreds}
                disabled={busy}
                className="mt-2 h-12 flex-row items-center justify-center rounded-xl bg-brand active:opacity-90"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-[15px] font-semibold text-white">
                    {forceLogout ? "Sign in (take over)" : "Sign in"}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(280)} className="gap-3">
              <Text className="text-center text-sm text-muted">
                {stage === "2fa-setup"
                  ? "Scan the QR in your authenticator app, then enter the 6-digit code."
                  : "Enter the 6-digit code from your authenticator app."}
              </Text>
              {stage === "2fa-setup" && qr ? (
                <Text selectable className="rounded-lg bg-surface-2 p-3 text-center text-[11px] text-muted">
                  {qr}
                </Text>
              ) : null}
              <TextInput
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                placeholderTextColor="#8293a0"
                className={`${fieldClass} text-center tracking-[8px]`}
              />
              <Pressable
                onPress={submit2fa}
                disabled={busy || code.length < 6}
                className="mt-2 h-12 items-center justify-center rounded-xl bg-brand active:opacity-90 disabled:opacity-50"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-[15px] font-semibold text-white">Verify</Text>}
              </Pressable>
              <Pressable onPress={() => setStage("credentials")} className="items-center py-2">
                <Text className="text-[13px] text-muted">Back</Text>
              </Pressable>
            </Animated.View>
          )}

          <Pressable onPress={toggle} className="mt-8 items-center">
            <Text className="text-[12px] text-muted">Switch to {resolved === "dark" ? "light" : "dark"} mode</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
