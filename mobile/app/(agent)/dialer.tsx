import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  cancelAnimation
} from "react-native-reanimated";

import { useSession } from "@/store/session";
import { useCall } from "@/store/call";
import { api } from "@/lib/api";

const STATUS_CYCLE = ["READY", "PAUSED", "WRAP_UP"] as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const KEYS: { d: string; sub?: string }[] = [
  { d: "1" },
  { d: "2", sub: "ABC" },
  { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" },
  { d: "5", sub: "JKL" },
  { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" },
  { d: "8", sub: "TUV" },
  { d: "9", sub: "WXYZ" },
  { d: "*" },
  { d: "0", sub: "+" },
  { d: "#" }
];

const STATUS = {
  READY: { label: "Ready", dot: "#16a34a" },
  PAUSED: { label: "Paused", dot: "#d97706" },
  WRAP_UP: { label: "Wrap-up", dot: "#0684BC" },
  ON_CALL: { label: "On call", dot: "#0684BC" },
  OFFLINE: { label: "Offline", dot: "#8293a0" }
} as const;

function prettyNumber(raw: string) {
  if (!raw) return "";
  if (raw.length <= 5) return raw; // extension
  // group the tail for readability, keep a leading + intact
  const plus = raw.startsWith("+");
  const body = plus ? raw.slice(1) : raw;
  const grouped = body.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  return (plus ? "+" : "") + grouped;
}

function DialKey({ item, onPress }: { item: { d: string; sub?: string }; onPress: (d: string) => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 12, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 240 });
      }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress(item.d);
      }}
      style={style}
      className="h-[74px] w-[74px] items-center justify-center rounded-full bg-surface-2 active:bg-brand/15"
    >
      <Text className="text-[27px] font-light leading-none text-text">{item.d}</Text>
      {item.sub ? (
        <Text className="mt-0.5 text-[10px] font-semibold tracking-[2px] text-muted">{item.sub}</Text>
      ) : (
        <View className="mt-0.5 h-[13px]" />
      )}
    </AnimatedPressable>
  );
}

export default function Dialer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const { start, simulateIncoming, isReal } = useCall();
  const [number, setNumber] = useState("");
  const [agentStatus, setAgentStatus] = useState<(typeof STATUS_CYCLE)[number]>(
    (session?.agentStatus as any) && STATUS_CYCLE.includes(session?.agentStatus as any)
      ? (session!.agentStatus as any)
      : "READY"
  );

  const status = STATUS[agentStatus] ?? STATUS.READY;
  const hasInput = number.length > 0;

  const cycleStatus = () => {
    Haptics.selectionAsync();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(agentStatus) + 1) % STATUS_CYCLE.length];
    setAgentStatus(next);
    api("/agent/status", { method: "POST", body: { status: next } }).catch(() => undefined);
  };

  const placeCall = () => {
    if (!hasInput) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    start(number.trim());
    router.push("/(agent)/call");
  };

  // Call button: idle glow when a number is ready to dial.
  const glow = useSharedValue(0);
  const callStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.04 }],
    shadowOpacity: 0.35 + glow.value * 0.35
  }));

  const setGlow = useCallback((on: boolean) => {
    cancelAnimation(glow);
    glow.value = on
      ? withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1)
      : withTiming(0, { duration: 200 });
  }, []);

  const push = (d: string) => {
    setNumber((n) => {
      const next = (n + d).slice(0, 24);
      if (!n) setGlow(true);
      return next;
    });
  };
  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber((n) => {
      const next = n.slice(0, -1);
      if (!next) setGlow(false);
      return next;
    });
  };
  const clearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNumber("");
    setGlow(false);
  };

  const display = useMemo(() => prettyNumber(number), [number]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 6 }}>
      {/* header */}
      <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
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
          className="mx-5 mb-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 active:opacity-60"
        >
          <Ionicons name="flask-outline" size={13} color="#8293a0" />
          <Text className="text-[11px] font-medium text-muted">Simulate incoming call (Expo Go)</Text>
        </Pressable>
      ) : null}

      {/* number display */}
      <View className="min-h-[112px] flex-1 items-center justify-center px-6">
        {hasInput ? (
          <Animated.Text
            entering={FadeIn.duration(120)}
            layout={LinearTransition}
            numberOfLines={1}
            adjustsFontSizeToFit
            className="text-center text-4xl font-light tracking-wide text-text"
          >
            {display}
          </Animated.Text>
        ) : (
          <Text className="text-center text-lg text-muted">Enter a number</Text>
        )}
      </View>

      {/* keypad */}
      <View className="items-center px-6 pb-2">
        <View className="w-full max-w-[320px] flex-row flex-wrap justify-between gap-y-3.5">
          {KEYS.map((k) => (
            <DialKey key={k.d} item={k} onPress={push} />
          ))}
        </View>

        {/* call row */}
        <View className="mt-4 w-full max-w-[320px] flex-row items-center justify-between">
          <View className="h-[74px] w-[74px]" />

          <AnimatedPressable
            disabled={!hasInput}
            onPress={placeCall}
            style={[
              callStyle,
              { shadowColor: "#16a34a", shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }
            ]}
            className={
              "h-[74px] w-[74px] items-center justify-center rounded-full " +
              (hasInput ? "bg-success" : "bg-success/30")
            }
          >
            <Ionicons name="call" size={30} color="#fff" />
          </AnimatedPressable>

          <Pressable
            onPress={back}
            onLongPress={clearAll}
            disabled={!hasInput}
            className="h-[74px] w-[74px] items-center justify-center rounded-full active:bg-surface-2"
            style={{ opacity: hasInput ? 1 : 0.25 }}
          >
            <Ionicons name="backspace-outline" size={26} color="#8293a0" />
          </Pressable>
        </View>
      </View>

      <View style={{ height: insets.bottom + 4 }} />
    </View>
  );
}
