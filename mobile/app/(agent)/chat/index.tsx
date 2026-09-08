import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";

function timeLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { ready, error, threads, directory } = useChat();
  const [tab, setTab] = useState<"chats" | "groups">("chats");
  const [newOpen, setNewOpen] = useState(false);

  const dms = useMemo(() => threads.filter((t) => t.kind === "dm"), [threads]);
  const groups = useMemo(() => threads.filter((t) => t.kind !== "dm"), [threads]);
  const list = tab === "chats" ? dms : groups;

  const openThread = (kind: string, id: string, name: string) =>
    router.push({ pathname: "/(agent)/chat/[id]", params: { id, kind, name } });

  const startDm = (peerId: string, name: string) => {
    setNewOpen(false);
    openThread("dm", peerId, name);
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-2xl font-extrabold text-text">Team Chat</Text>
        <Pressable
          onPress={() => setNewOpen((v) => !v)}
          className="h-9 w-9 items-center justify-center rounded-full bg-brand active:opacity-90"
        >
          <Ionicons name={newOpen ? "close" : "create-outline"} size={18} color="#fff" />
        </Pressable>
      </View>

      <View className="mx-4 mb-2 flex-row gap-2">
        {(["chats", "groups"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 ${tab === k ? "bg-brand" : "bg-surface-2"}`}
          >
            <Text className={`text-[13px] font-semibold ${tab === k ? "text-white" : "text-muted"}`}>
              {k === "chats" ? "Chats" : "Groups"}
            </Text>
          </Pressable>
        ))}
      </View>

      {newOpen ? (
        <View className="mx-4 mb-2 max-h-64 rounded-2xl border border-border bg-surface">
          <Text className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">Start a chat</Text>
          <FlatList
            data={directory.agents}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => startDm(item.id, item.name)}
                className="flex-row items-center gap-3 border-t border-border/60 px-4 py-3 active:bg-surface-2"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-brand/10">
                  <Text className="text-[11px] font-bold text-brand">{item.name.slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text className="text-[14px] text-text">{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text className="px-4 py-3 text-[13px] text-muted">No teammates found</Text>}
          />
        </View>
      ) : null}

      {!ready && !error ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0684BC" />
          <Text className="mt-2 text-[12px] text-muted">Connecting…</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={26} color="#8293a0" />
          <Text className="mt-2 text-center text-[13px] text-muted">{error}</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openThread(item.kind, item.id, item.name)}
              className="mb-1.5 flex-row items-center gap-3 rounded-xl border border-border bg-surface p-3 active:bg-surface-2"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-brand/10">
                <Text className="text-[13px] font-bold text-brand">{item.avatar}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-text">
                    {item.name}
                  </Text>
                  <Text className="ml-2 text-[11px] text-muted">{timeLabel(item.lastTime)}</Text>
                </View>
                <View className="mt-0.5 flex-row items-center justify-between">
                  <Text numberOfLines={1} className="flex-1 text-[12px] text-muted">
                    {item.lastText || "No messages yet"}
                  </Text>
                  {item.unread > 0 ? (
                    <View className="ml-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5">
                      <Text className="text-[11px] font-bold text-white">{item.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text className="mt-16 text-center text-[13px] text-muted">
              {tab === "chats" ? "No conversations yet — tap ✎ to start one" : "You're not in any team groups"}
            </Text>
          }
        />
      )}
    </View>
  );
}
