import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/store/session";
import { useChat } from "@/store/chat";
import {
  dmId,
  markThreadSeen,
  sendMessage,
  subscribeMessages,
  type ChatKind,
  type ChatMessage
} from "@/lib/chat";

function dayStamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function ChatThread() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { tenantId } = useChat();
  const params = useLocalSearchParams<{ id: string; kind: string; name: string }>();

  const me = { id: session!.user.id, name: session!.user.name };
  const kind = (params.kind as ChatKind) || "dm";
  const threadId = kind === "dm" ? dmId(me.id, String(params.id)) : String(params.id);
  const title = params.name || "Chat";

  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<any>>(null);

  useEffect(() => {
    if (!tenantId) return;
    const unsub = subscribeMessages(tenantId, kind, threadId, me.id, (m) => {
      setMsgs(m);
      markThreadSeen(tenantId, kind, threadId, me.id, Date.now()).catch(() => {});
    });
    return unsub;
  }, [tenantId, kind, threadId]);

  useEffect(() => {
    if (msgs?.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
  }, [msgs?.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !tenantId || sending) return;
    setText("");
    setSending(true);
    try {
      await sendMessage(tenantId, kind, threadId, me, t);
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const rows = useMemo<(ChatMessage & { showDay?: boolean })[]>(() => {
    const out: (ChatMessage & { showDay?: boolean })[] = [];
    let lastDay = "";
    for (const m of msgs || []) {
      const d = dayStamp(m.time);
      out.push({ ...m, showDay: d !== lastDay });
      lastDay = d;
    }
    return out;
  }, [msgs]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {/* header */}
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={10} className="p-1">
          <Ionicons name="chevron-back" size={24} color="#8293a0" />
        </Pressable>
        <View className="h-8 w-8 items-center justify-center rounded-full bg-brand/10">
          <Text className="text-[11px] font-bold text-brand">{title.slice(0, 2).toUpperCase()}</Text>
        </View>
        <Text numberOfLines={1} className="flex-1 text-[16px] font-bold text-text">
          {title}
        </Text>
        {kind !== "dm" ? <Ionicons name="people" size={16} color="#8293a0" /> : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 8}
      >
        {msgs === null ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0684BC" />
          </View>
        ) : (
          <FlatList<ChatMessage & { showDay?: boolean }>
            ref={listRef}
            data={rows}
            keyExtractor={(m) => m.key}
            contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              if (item.system) {
                return (
                  <Text className="my-2 text-center text-[11px] text-muted">{item.text}</Text>
                );
              }
              const mine = item.senderId === me.id;
              return (
                <View>
                  {item.showDay ? (
                    <Text className="my-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {dayStamp(item.time)}
                    </Text>
                  ) : null}
                  <View className={"mb-1.5 max-w-[82%] " + (mine ? "self-end" : "self-start")}>
                    {!mine && kind !== "dm" ? (
                      <Text className="mb-0.5 ml-1 text-[10px] font-semibold text-brand">{item.senderName}</Text>
                    ) : null}
                    <View
                      className={
                        "rounded-2xl px-3 py-2 " +
                        (mine ? "rounded-br-md bg-brand" : "rounded-bl-md bg-surface border border-border")
                      }
                    >
                      {item.deleted ? (
                        <Text className={"text-[13px] italic " + (mine ? "text-white/70" : "text-muted")}>
                          Message deleted
                        </Text>
                      ) : (
                        <>
                          {item.attachments?.map((a, i) => (
                            <Text
                              key={i}
                              className={"text-[13px] underline " + (mine ? "text-white" : "text-brand")}
                            >
                              📎 {a.fileName}
                            </Text>
                          ))}
                          {item.text ? (
                            <Text className={"text-[14px] " + (mine ? "text-white" : "text-text")}>{item.text}</Text>
                          ) : null}
                        </>
                      )}
                      <Text className={"mt-0.5 text-[9px] " + (mine ? "text-white/60" : "text-muted")}>
                        {new Date(item.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text className="mt-16 text-center text-[13px] text-muted">Say hi 👋</Text>}
          />
        )}

        {/* composer */}
        <View
          className="flex-row items-end gap-2 border-t border-border bg-surface px-3 py-2"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor="#8293a0"
            multiline
            className="max-h-28 flex-1 rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] text-text"
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || sending}
            className="h-10 w-10 items-center justify-center rounded-full bg-brand disabled:opacity-40"
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
