import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/store/session";
import { useChat } from "@/store/chat";
import { useTheme } from "@/theme/ThemeProvider";
import {
  callAccountStatus,
  callkeepAvailable,
  callkeepNativeLoaded,
  openCallAccountSettings,
  type CallAccountStatus
} from "@/lib/callkeep";

function CallAccountRow() {
  const [st, setSt] = useState<CallAccountStatus | null>(null);

  const refresh = useCallback(() => {
    callAccountStatus().then(setSt);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (!callkeepAvailable) return null;

  const enabled = !!st?.enabled;
  const unsupported = st != null && !st.supported;
  const label = !callkeepNativeLoaded
    ? "Not available in this build"
    : enabled
      ? "On — calls show full-screen"
      : unsupported
        ? "Not supported on this device"
        : "Off — tap to enable";

  return (
    <Pressable
      onPress={() => {
        openCallAccountSettings();
      }}
      disabled={!callkeepNativeLoaded || enabled || unsupported}
      className="mx-4 mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4 active:bg-surface-2"
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-full ${enabled ? "bg-emerald-500/15" : "bg-amber-500/15"}`}
      >
        <Ionicons name="call" size={18} color={enabled ? "#10b981" : "#f59e0b"} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-text">Calling account</Text>
        <Text className="mt-0.5 text-[12px] text-muted">{label}</Text>
      </View>
      {!enabled && callkeepNativeLoaded && !unsupported ? (
        <Ionicons name="chevron-forward" size={18} color="#8293a0" />
      ) : null}
    </Pressable>
  );
}

const THEME_OPTIONS: { key: "light" | "dark" | "system"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "light", label: "Light", icon: "sunny" },
  { key: "dark", label: "Dark", icon: "moon" },
  { key: "system", label: "System", icon: "phone-portrait" }
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, logout } = useSession();
  const { pref, setPref } = useTheme();
  const unread = useChat((s) => s.unreadTotal);
  const isAgent = Boolean(session?.sip?.username);

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <Text className="px-5 pb-3 text-2xl font-extrabold text-text">Settings</Text>

      <View className="mx-4 mb-4 rounded-2xl border border-border bg-surface p-4">
        <Text className="text-base font-semibold text-text">{session?.user.name}</Text>
        <Text className="mt-0.5 text-[13px] text-muted">{session?.user.email}</Text>
        <Text className="mt-0.5 text-[12px] text-muted">
          {session?.role?.name} · {session?.tenant.name}
        </Text>
      </View>

      {isAgent ? (
        <Pressable
          onPress={() => router.push("/(agent)/chat" as any)}
          className="mx-4 mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4 active:bg-surface-2"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-brand/10">
            <Ionicons name="chatbubbles" size={18} color="#0684BC" />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-text">Team Chat</Text>
          {unread > 0 ? (
            <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5">
              <Text className="text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color="#8293a0" />
        </Pressable>
      ) : null}

      {isAgent ? <CallAccountRow /> : null}

      <Text className="px-5 pb-2 pt-2 text-[12px] font-bold uppercase tracking-wide text-muted">Appearance</Text>
      <View className="mx-4 mb-4 flex-row gap-2 rounded-2xl border border-border bg-surface p-2">
        {THEME_OPTIONS.map((o) => {
          const active = pref === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setPref(o.key)}
              className={`flex-1 items-center gap-1 rounded-xl py-3 ${active ? "bg-brand" : "bg-surface-2"}`}
            >
              <Ionicons name={o.icon} size={18} color={active ? "#fff" : "#8293a0"} />
              <Text className={`text-[12px] font-semibold ${active ? "text-white" : "text-muted"}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={logout}
        className="mx-4 mt-2 h-12 flex-row items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/10 active:opacity-80"
      >
        <Ionicons name="log-out-outline" size={18} color="#dc2626" />
        <Text className="text-[15px] font-semibold text-danger">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
