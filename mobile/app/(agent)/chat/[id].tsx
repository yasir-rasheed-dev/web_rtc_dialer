import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
  deleteMessageForEveryone,
  deleteMessageForMe,
  dmId,
  editMessageText,
  markThreadSeen,
  sendMessage,
  subscribeMessages,
  uploadChatFile,
  type Attachment,
  type ChatKind,
  type ChatMessage
} from "@/lib/chat";
import { notifyRecipients } from "@/lib/push";

type Tray = {
  id: string;
  uri: string;
  name: string;
  type: string;
  status: "pending" | "uploading" | "error";
};

function dayStamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const isImage = (mime?: string) => !!mime && mime.startsWith("image/");
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;

export default function ChatThread() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { tenantId, directory } = useChat();
  const params = useLocalSearchParams<{ id: string; kind: string; name: string }>();

  const me = { id: String(session!.user.id), name: session!.user.name };
  const kind = (params.kind as ChatKind) || "dm";
  const peerOrTeamId = String(params.id);
  const threadId = kind === "dm" ? dmId(me.id, peerOrTeamId) : peerOrTeamId;
  const title = params.name || "Chat";

  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [tray, setTray] = useState<Tray[]>([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ key: string; original: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
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

  // recipients for push: DM peer, or the rest of the team group
  const recipientIds = useMemo(() => {
    if (kind === "dm") return [peerOrTeamId];
    const team = directory.teams.find((t) => t.id === peerOrTeamId);
    return (team?.members || []).map((m) => String(m.id)).filter((id) => id !== me.id);
  }, [kind, peerOrTeamId, directory]);

  const notify = useCallback(
    (preview: string) => {
      if (!recipientIds.length) return;
      notifyRecipients(recipientIds, {
        title: kind === "dm" ? me.name : `${title} · ${me.name}`,
        body: preview,
        data: { id: peerOrTeamId, kind, name: title }
      });
    },
    [recipientIds, kind, title, peerOrTeamId]
  );

  /* ---- attachments ---- */
  const addFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow photo access to attach images.");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.7
    });
    if (res.canceled) return;
    setTray((prev) => [
      ...prev,
      ...res.assets.map((a) => ({
        id: uid(),
        uri: a.uri,
        name: a.fileName || `photo-${Date.now()}.jpg`,
        type: a.mimeType || "image/jpeg",
        status: "pending" as const
      }))
    ]);
  };

  const addFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow camera access to take a photo.");
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled) return;
    const a = res.assets[0];
    setTray((prev) => [
      ...prev,
      {
        id: uid(),
        uri: a.uri,
        name: a.fileName || `photo-${Date.now()}.jpg`,
        type: a.mimeType || "image/jpeg",
        status: "pending"
      }
    ]);
  };

  const attach = () =>
    Alert.alert("Add photo", undefined, [
      { text: "Camera", onPress: addFromCamera },
      { text: "Photo Library", onPress: addFromLibrary },
      { text: "Cancel", style: "cancel" }
    ]);

  const removeTray = (id: string) => setTray((prev) => prev.filter((t) => t.id !== id));

  /* ---- send ---- */
  const canSend = (text.trim().length > 0 || tray.some((t) => t.status !== "error")) && !sending;

  const send = async () => {
    if (editing) return saveEdit();
    const body = text.trim();
    const toSend = tray.filter((t) => t.status !== "error");
    if ((!body && !toSend.length) || !tenantId || sending) return;

    setSending(true);
    setText("");
    const uploaded: Attachment[] = [];
    let anyFail = false;

    for (const item of toSend) {
      setTray((prev) => prev.map((t) => (t.id === item.id ? { ...t, status: "uploading" } : t)));
      try {
        const att = await uploadChatFile(item.uri, item.name, item.type);
        uploaded.push(att);
        setTray((prev) => prev.filter((t) => t.id !== item.id));
      } catch (e: any) {
        anyFail = true;
        setTray((prev) => prev.map((t) => (t.id === item.id ? { ...t, status: "error" } : t)));
      }
    }

    if (!body && !uploaded.length) {
      setSending(false);
      if (anyFail) Alert.alert("Couldn't send", "The image failed to upload. Tap it to retry.");
      if (body) setText(body);
      return;
    }

    try {
      await sendMessage(tenantId, kind, threadId, me, body, uploaded.length ? uploaded : undefined);
      notify(body || (uploaded.length > 1 ? `📷 ${uploaded.length} photos` : "📷 Photo"));
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
    if (anyFail) Alert.alert("Some images failed", "The messages sent, but a photo didn't upload. Tap it to retry.");
  };

  const retryTray = (id: string) =>
    setTray((prev) => prev.map((t) => (t.id === id ? { ...t, status: "pending" } : t)));

  /* ---- edit / delete ---- */
  const startEdit = (m: ChatMessage) => {
    setEditing({ key: m.key, original: m.text || "" });
    setText(m.text || "");
  };
  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };
  const saveEdit = async () => {
    if (!editing || !tenantId) return;
    const next = text.trim();
    if (!next || next === editing.original) return cancelEdit();
    setSending(true);
    try {
      await editMessageText(tenantId, kind, threadId, editing.key, next);
      cancelEdit();
    } catch {
      Alert.alert("Couldn't edit", "Try again.");
    } finally {
      setSending(false);
    }
  };

  const onLongPress = (m: ChatMessage) => {
    if (m.system || m.deleted) return;
    const mine = m.senderId === me.id;
    const opts: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (mine && m.text != null && m.text !== "") opts.push({ text: "Edit", onPress: () => startEdit(m) });
    if (mine)
      opts.push({
        text: "Delete for everyone",
        style: "destructive",
        onPress: () =>
          tenantId && deleteMessageForEveryone(tenantId, kind, threadId, m.key).catch(() => Alert.alert("Failed"))
      });
    opts.push({
      text: "Delete for me",
      style: "destructive",
      onPress: () =>
        tenantId && deleteMessageForMe(tenantId, kind, threadId, m.key, me.id).catch(() => Alert.alert("Failed"))
    });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", undefined, opts);
  };

  /* ---- rows ---- */
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
                  <Pressable
                    onLongPress={() => onLongPress(item)}
                    delayLongPress={300}
                    className={"mb-1.5 max-w-[82%] " + (mine ? "self-end" : "self-start")}
                  >
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
                          This message was deleted
                        </Text>
                      ) : (
                        <View>
                          {item.attachments?.map((a, i) =>
                            isImage(a.mimeType) ? (
                              <Pressable key={i} onPress={() => setViewer(a.url)}>
                                <Image
                                  source={{ uri: a.url }}
                                  style={{ width: 230, height: 230 }}
                                  resizeMode="cover"
                                />
                              </Pressable>
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
                      <Text className={"px-3 pb-1.5 text-[9px] " + (mine ? "text-white/60" : "text-muted")}>
                        {clockOf(item.time)}
                        {item.editedAt ? " · edited" : ""}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={<Text className="mt-16 text-center text-[13px] text-muted">Say hi 👋</Text>}
          />
        )}

        {/* edit banner */}
        {editing ? (
          <View className="flex-row items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2">
            <Ionicons name="pencil" size={14} color="#d97706" />
            <Text className="flex-1 text-[12px] font-medium text-amber-700">Editing message</Text>
            <Pressable onPress={cancelEdit} hitSlop={8}>
              <Ionicons name="close" size={16} color="#8293a0" />
            </Pressable>
          </View>
        ) : null}

        {/* attachment tray */}
        {tray.length > 0 && !editing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="max-h-24 border-t border-border bg-surface"
            contentContainerStyle={{ padding: 8, gap: 8 }}
          >
            {tray.map((t) => (
              <View key={t.id} className="h-20 w-20 overflow-hidden rounded-xl bg-surface-2">
                <Image source={{ uri: t.uri }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                {t.status === "uploading" ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : null}
                {t.status === "error" ? (
                  <Pressable
                    onPress={() => retryTray(t.id)}
                    className="absolute inset-0 items-center justify-center bg-danger/50"
                  >
                    <Ionicons name="refresh" size={20} color="#fff" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => removeTray(t.id)}
                  hitSlop={6}
                  className="absolute right-0.5 top-0.5 h-5 w-5 items-center justify-center rounded-full bg-black/60"
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {/* composer */}
        <View
          className="flex-row items-end gap-2 border-t border-border bg-surface px-3 py-2"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          {!editing ? (
            <Pressable
              onPress={attach}
              disabled={sending}
              className="h-10 w-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
            >
              <Ionicons name="add" size={22} color="#8293a0" />
            </Pressable>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={editing ? "Edit message" : "Message"}
            placeholderTextColor="#8293a0"
            multiline
            className="max-h-28 flex-1 rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] text-text"
          />
          <Pressable
            onPress={send}
            disabled={editing ? !text.trim() || sending : !canSend}
            className={
              "h-10 w-10 items-center justify-center rounded-full disabled:opacity-40 " +
              (editing ? "bg-amber-600" : "bg-brand")
            }
          >
            <Ionicons name={editing ? "checkmark" : "arrow-up"} size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* full-screen image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable className="flex-1 items-center justify-center bg-black/95" onPress={() => setViewer(null)}>
          {viewer ? (
            <Image source={{ uri: viewer }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
          ) : null}
          <Pressable
            onPress={() => setViewer(null)}
            className="absolute right-5 h-10 w-10 items-center justify-center rounded-full bg-white/15"
            style={{ top: insets.top + 8 }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
