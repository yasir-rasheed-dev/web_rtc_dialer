import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/store/session";
import { useTheme } from "@/theme/ThemeProvider";

const THEME_OPTIONS: { key: "light" | "dark" | "system"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "light", label: "Light", icon: "sunny" },
  { key: "dark", label: "Dark", icon: "moon" },
  { key: "system", label: "System", icon: "phone-portrait" }
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, logout } = useSession();
  const { pref, setPref } = useTheme();

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
