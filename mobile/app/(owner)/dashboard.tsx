import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/lib/api";
import { useSession } from "@/store/session";

type Kpis = {
  summary?: { total_calls?: number; completed_calls?: number; answer_rate?: number; total_talk_sec?: number };
};

function Stat({ label, value, i }: { label: string; value: string; i: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(i * 60)}
      className="min-w-[44%] flex-1 rounded-2xl border border-border bg-surface p-4"
    >
      <Text className="text-2xl font-extrabold text-text">{value}</Text>
      <Text className="mt-1 text-[12px] text-muted">{label}</Text>
    </Animated.View>
  );
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Kpis>("/reports/kpis?days=1"));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const s = data?.summary ?? {};
  const talkMin = Math.round((s.total_talk_sec ?? 0) / 60);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#0684BC" />}
    >
      <Text className="px-5 text-[13px] text-muted">Welcome back</Text>
      <Text className="px-5 pb-4 text-2xl font-extrabold text-text">{session?.user.name}</Text>

      {loading && !data ? (
        <ActivityIndicator className="mt-16" color="#0684BC" />
      ) : (
        <View className="flex-row flex-wrap gap-3 px-4">
          <Stat i={0} label="Calls today" value={String(s.total_calls ?? 0)} />
          <Stat i={1} label="Answered" value={String(s.completed_calls ?? 0)} />
          <Stat i={2} label="Answer rate" value={`${s.answer_rate ?? 0}%`} />
          <Stat i={3} label="Talk time" value={`${talkMin}m`} />
        </View>
      )}

      <Text className="px-5 pb-2 pt-6 text-[12px] font-bold uppercase tracking-wide text-muted">Coming next</Text>
      <View className="mx-4 rounded-2xl border border-border bg-surface p-4">
        <Text className="text-[13px] leading-relaxed text-muted">
          Live calls board, agent presence, reports with date range, and supervisor listen / whisper / barge land in Phase 4.
        </Text>
      </View>
    </ScrollView>
  );
}
