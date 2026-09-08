import { useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";

import { useSession } from "@/store/session";
import { useCall } from "@/store/call";
import { api } from "@/lib/api";
import Keypad, { KEYPAD_GAP_X } from "@/components/Keypad";

const STATUS_CYCLE = ["READY", "PAUSED", "WRAP_UP"] as const;
const STATUS: Record<string, { label: string; dot: string }> = {
  READY: { label: "Ready", dot: "#16a34a" },
  PAUSED: { label: "Paused", dot: "#d97706" },
  WRAP_UP: { label: "Wrap-up", dot: "#0684BC" },
  ON_CALL: { label: "On call", dot: "#0684BC" },
  OFFLINE: { label: "Offline", dot: "#8293a0" }
};

function prettyNumber(raw: string) {
  if (!raw) return "";
  if (raw.length <= 5) return raw;
  const plus = raw.startsWith("+");
  const body = plus ? raw.slice(1) : raw;
  const grouped = body.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  return (plus ? "+" : "") + grouped;
}

export default function Dialer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const { start, simulateIncoming, isReal } = useCall();

  const [number, setNumber] = useState("");
  const [agentStatus, setAgentStatus] = useState<(typeof STATUS_CYCLE)[number]>(
    STATUS_CYCLE.includes(session?.agentStatus as any) ? (session!.agentStatus as any) : "READY"
  );

  const status = STATUS[agentStatus] ?? STATUS.READY;
  const hasInput = number.length > 0;

  // key diameter: fills the width on small phones, caps at 76 on large
  const PAGE_PAD = 24;
  const keySize = Math.max(60, Math.min(76, Math.floor((width - PAGE_PAD * 2 - KEYPAD_GAP_X * 2) / 3)));

  const cycleStatus = () => {
    Haptics.selectionAsync();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(agentStatus) + 1) % STATUS_CYCLE.length];
    setAgentStatus(next);
    api("/agent/status", { method: "POST", body: { status: next } }).catch(() => undefined);
  };

  const push = (d: string) => setNumber((n) => (n + d).slice(0, 24));
  const insertPlus = () => {
    Haptics.selectionAsync();
    setNumber((n) => (n ? n : "+"));
  };
  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber((n) => n.slice(0, -1));
  };
  const clearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNumber("");
  };

  const placeCall = () => {
    if (!hasInput) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    start(number.trim());
    router.push("/(agent)/call");
  };

  const display = useMemo(() => prettyNumber(number), [number]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 6, paddingHorizontal: PAGE_PAD }}>
      {/* header */}
      <View className="flex-row items-center justify-between pb-1 pt-2">
        <View>
          <Text className="text-[15px] font-bold text-text">{session?.user.name ?? "Agent"}</Text>
          <Text className="text-[11px] text-muted">
            {session?.sip?.username ? `Ext. ${session.sip.username}` : "No SIP account"}
          </Text>
        </View>
        <Pressable
          onPress={cycleStatus}
          className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 active:opacity-70"
        >
          <View style={{ backgroundColor: status.dot }} className="h-2 w-2 rounded-full" />
          <Text className="text-[12px] font-semibold text-text">{status.label}</Text>
          <Ionicons name="chevron-down" size={12} color="#8293a0" />
        </Pressable>
      </View>

      {!isReal() ? (
        <Pressable
          onPress={() => simulateIncoming({ name: "Test Caller", number: "+92 300 1234567" })}
          className="mt-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 active:opacity-60"
        >
          <Ionicons name="flask-outline" size={13} color="#8293a0" />
          <Text className="text-[11px] font-medium text-muted">Simulate incoming call (Expo Go)</Text>
        </Pressable>
      ) : null}

      {/* number display + inline backspace (iOS-style) */}
      <View className="flex-1 flex-row items-center justify-center">
        <View style={{ width: 40 }} />
        <View className="flex-1 items-center">
          {hasInput ? (
            <Animated.Text
              entering={FadeIn.duration(120)}
              layout={LinearTransition}
              numberOfLines={1}
              adjustsFontSizeToFit
              allowFontScaling={false}
              className="text-center text-4xl font-light tracking-wide text-text"
            >
              {display}
            </Animated.Text>
          ) : (
            <Text className="text-center text-base text-muted">Enter a number</Text>
          )}
        </View>
        <Pressable
          onPress={back}
          onLongPress={clearAll}
          disabled={!hasInput}
          hitSlop={10}
          style={{ width: 40, opacity: hasInput ? 1 : 0 }}
          className="items-center"
        >
          <Ionicons name="backspace-outline" size={26} color="#8293a0" />
        </Pressable>
      </View>

      {/* symmetric keypad */}
      <Keypad size={keySize} onPress={push} onLongPressZero={insertPlus} />

      {/* call button — centred, iOS-style */}
      <View className="items-center pb-2 pt-5" style={{ marginBottom: insets.bottom }}>
        <Pressable
          disabled={!hasInput}
          onPress={placeCall}
          style={{
            width: keySize,
            height: keySize,
            shadowColor: "#16a34a",
            shadowRadius: 14,
            shadowOpacity: hasInput ? 0.5 : 0,
            shadowOffset: { width: 0, height: 6 }
          }}
          className={"items-center justify-center rounded-full " + (hasInput ? "bg-success" : "bg-success/25")}
        >
          <Ionicons name="call" size={Math.round(keySize * 0.42)} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
