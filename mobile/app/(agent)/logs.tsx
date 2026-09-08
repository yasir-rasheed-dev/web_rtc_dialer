import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/lib/api";

type CallRow = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  from_number: string;
  to_number: string;
  agent_name?: string;
  started_at: string;
  billable_sec?: number;
  answered_at?: string | null;
};

const TABS = [
  { id: "all", label: "All", params: {} as Record<string, string> },
  { id: "incoming", label: "In", params: { direction: "INBOUND" } },
  { id: "outgoing", label: "Out", params: { direction: "OUTBOUND" } },
  { id: "missed", label: "Missed", params: { outcome: "missed" } }
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(s = 0) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function Logs() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (t = tab) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "40", ...(TABS.find((x) => x.id === t)?.params ?? {}) });
        const res = await api<{ rows: CallRow[] }>(`/calls?${params.toString()}`);
        setRows(res.rows ?? []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [tab])
  );

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <Text className="px-5 pb-3 text-2xl font-extrabold text-text">Call Logs</Text>

      <View className="mx-4 mb-2 flex-row gap-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 ${active ? "bg-brand" : "bg-surface-2"}`}
            >
              <Text className={`text-[13px] font-semibold ${active ? "text-white" : "text-muted"}`}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && rows.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0684BC" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(tab)} tintColor="#0684BC" />}
          ListEmptyComponent={<Text className="mt-16 text-center text-muted">No calls</Text>}
          renderItem={({ item }) => {
            const outbound = item.direction === "OUTBOUND";
            const other = outbound ? item.to_number : item.from_number;
            const connected = Boolean(item.answered_at);
            return (
              <View className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <Ionicons
                  name={outbound ? "arrow-up-circle" : connected ? "arrow-down-circle" : "close-circle"}
                  size={22}
                  color={outbound ? "#0684BC" : connected ? "#16a34a" : "#dc2626"}
                />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-text">{other || "Unknown"}</Text>
                  <Text className="text-[12px] text-muted">
                    {fmtTime(item.started_at)}
                    {connected ? ` · ${fmtDur(item.billable_sec)}` : " · no answer"}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
