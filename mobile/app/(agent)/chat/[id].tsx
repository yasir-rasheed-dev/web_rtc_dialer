import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/store/session";
import { useChat } from "@/store/chat";
import {
  dmId,
  markThreadSeen,
  pushTokensFor,
  sendMessage,
  subscribeMessages,
  uploadChatFile,
  type ChatKind,
  type ChatMessage
} from "@/lib/chat";
import { sendPush } from "@/lib/push";

function dayStamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const isImage = (mime?: string) => !!mime && mime.startsWith("image/");

export default function ChatThread() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { tenantId, directory } = useChat();
  const params = useLocalSearchParams<{ id: string; kind: string; name: string }>();

  const me = { id: session!.user.id, name: session!.user.name };
  const kind = (params.kind as ChatKind) || "dm";
  const peerOrTeamId = String(params.id);
  const threadId = kind === "dm" ? dmId(me.id, peerOrTeamId) : peerOrTeamId;
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

  // who to push: the DM peer, or every other member of the team group
  const recipientIds = useMemo(() => {
    if (kind === "dm") return [peerOrTeamId];
    const team = directory.teams.find((t) => t.id === peerOrTeamId);
    return (team?.members || []).map((m) => m.id).filter((id) => id !== me.id);
  }, [kind, peerOrTeamId, directory]);

  const notify = useCallback(
    async (preview: string) => {
      if (!tenantId || !recipientIds.length) return;
      const tokens = await pushTokensFor(tenantId, recipientIds);
      await sendPush(tokens, {
        title: kind === "dm" ? me.name : `${title} · ${me.name}`,
        body: preview,
        data: { id: peerOrTeamId, kind, name: title }
      });
    },
    [tenantId, recipientIds, kind, title, peerOrTeamId]
  );

  const send = async () => {
    const t = text.trim();
    if (!t || !tenantId || sending) return;
    setText("");
    setSending(true);
    try {
      await sendMessage(tenantId, kind, threadId, me, t);
      notify(t).catch(() => {});
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const pickAndSend = async (from: "camera" | "library") => {
    try {
      const perm =
        from === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Allow ${from === "camera" ? "camera" : "photos"} access to send images.`);
        return;
      }
      const res =
        from === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ["images"] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
      if (res.canceled || !res.assets?.length || !tenantId) return;

      setSending(true);
      const asset = res.assets[0];
      const name = asset.fileName || `photo-${Date.now()}.jpg`;
      const type = asset.mimeType || "image/jpeg";
      const up = await uploadChatFile(asset.uri, name, type);
      await sendMessage(tenantId, kind, threadId, me, "", [
        { url: up.url, fileName: up.fileName, mimeType: up.mimeType, size: up.size }
      ]);
      notify("📷 Photo").catch(() => {});
    } catch (e) {
      Alert.alert("Couldn't send", "The image failed to upload. Try again.");
    } finally {
      setSending(false);
    }
  };

  const attach = () =>
    Alert.alert("Send a photo", undefined, [
      { text: "Camera", onPress: () => pickAndSend("camera") },
      { text: "Photo Library", onPress: () => pickAndSend("library") },
      { text: "Cancel", style: "cancel" }
    ]);

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
                return <Text className="my-2 text-center text-[11px] text-muted">{item.text}</Text>;
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
                        "overflow-hidden rounded-2xl " +
                        (mine ? "rounded-br-md bg-brand" : "rounded-bl-md border border-border bg-surface")
                      }
                    >
                      {item.deleted ? (
                        <Text className={"px-3 py-2 text-[13px] italic " + (mine ? "text-white/70" : "text-muted")}>
                          Message deleted
                        </Text>
                      ) : (
                        <View>
                          {item.attachments?.map((a, i) =>
                            isImage(a.mimeType) ? (
                              <Image
                                key={i}
                                source={{ uri: a.url }}
                                style={{ width: 220, height: 220 }}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text
                                key={i}
                                className={"px-3 py-2 text-[13px] underline " + (mine ? "text-white" : "text-brand")}
                              >
                                📎 {a.fileName}
                              </Text>
                            )
                          )}
                          {item.text ? (
                            <Text className={"px-3 py-2 text-[14px] " + (mine ? "text-white" : "text-text")}>
                              {item.text}
                            </Text>
                          ) : null}
                        </View>
                      )}
                      <Text
                        className={
                          "px-3 pb-1.5 text-[9px] " + (mine ? "text-white/60" : "text-muted")
                        }
                      >
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

        <View
          className="flex-row items-end gap-2 border-t border-border bg-surface px-3 py-2"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <Pressable
            onPress={attach}
            disabled={sending}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Ionicons name="camera" size={20} color="#8293a0" />
          </Pressable>
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
