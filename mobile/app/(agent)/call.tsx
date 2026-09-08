import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation
} from "react-native-reanimated";

import { useCall } from "@/store/call";
import { useElapsed, mmss } from "@/components/useElapsed";
import Keypad from "@/components/Keypad";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CircleBtn({
  icon,
  label,
  active,
  danger,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      className="w-[33%] items-center gap-2 py-2"
    >
      <View
        className={
          "h-[64px] w-[64px] items-center justify-center rounded-full " +
          (danger ? "bg-danger" : active ? "bg-white" : "bg-white/15")
        }
      >
        <Ionicons name={icon} size={26} color={danger ? "#fff" : active ? "#0d1524" : "#fff"} />
      </View>
      <Text className="text-[12px] text-white/70">{label}</Text>
    </Pressable>
  );
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snap, hangup, toggleMute, toggleHold, toggleSpeaker, dtmf } = useCall();
  const [pad, setPad] = useState(false);
  const [typed, setTyped] = useState("");

  const elapsed = useElapsed(snap.connectedAt);
  const ringing = snap.status === "dialing" || snap.status === "ringing";
  const party = snap.party;

  // leave the screen shortly after the call ends
  useEffect(() => {
    if (snap.status === "idle") router.back();
    if (snap.status === "ended") {
      const t = setTimeout(() => router.back(), 900);
      return () => clearTimeout(t);
    }
  }, [snap.status]);

  // pulsing avatar ring while connecting
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (ringing) {
      pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [ringing]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 - pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.35 }]
  }));

  const statusText =
    snap.status === "dialing"
      ? "Calling…"
      : snap.status === "ringing"
        ? "Ringing…"
        : snap.status === "held"
          ? "On hold"
          : snap.status === "ended"
            ? "Call ended"
            : mmss(elapsed);

  const tap = (d: string) => {
    Haptics.selectionAsync();
    setTyped((t) => (t + d).slice(0, 32));
    dtmf(d);
  };

  return (
    <View className="flex-1 bg-[#0d1524]" style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}>
      {/* identity */}
      <View className="items-center px-8">
        <View className="mb-6 h-[112px] w-[112px] items-center justify-center">
          <Animated.View style={ringStyle} className="absolute h-[112px] w-[112px] rounded-full bg-brand" />
          <View className="h-[104px] w-[104px] items-center justify-center rounded-full bg-white/10">
            <Text className="text-3xl font-semibold text-white">{initials(party?.name || "?")}</Text>
          </View>
        </View>
        <Text numberOfLines={1} className="text-2xl font-semibold text-white">
          {party?.name || "Unknown"}
        </Text>
        {party?.number && party.number !== party.name ? (
          <Text className="mt-1 text-[13px] text-white/50">{party.number}</Text>
        ) : null}
        <Text className="mt-3 text-[15px] font-medium text-white/70">{statusText}</Text>
        {pad && typed ? <Text className="mt-3 text-lg tracking-[3px] text-white">{typed}</Text> : null}
      </View>

      <View className="flex-1" />

      {/* controls */}
      <View className="px-6">
        {pad ? (
          <Animated.View entering={FadeIn} className="items-center">
            <Keypad variant="dtmf" size={64} onPress={tap} />
            <Pressable onPress={() => setPad(false)} className="mt-3 px-4 py-2">
              <Text className="text-[14px] font-semibold text-white/70">Hide</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View className="flex-row flex-wrap">
            <CircleBtn icon={snap.muted ? "mic-off" : "mic"} label="mute" active={snap.muted} onPress={toggleMute} />
            <CircleBtn icon="keypad" label="keypad" onPress={() => setPad(true)} />
            <CircleBtn
              icon={snap.speaker ? "volume-high" : "volume-medium"}
              label="speaker"
              active={snap.speaker}
              onPress={toggleSpeaker}
            />
            <CircleBtn icon="pause" label={snap.held ? "resume" : "hold"} active={snap.held} onPress={toggleHold} />
            <CircleBtn icon="person-add" label="add" onPress={() => {}} />
            <CircleBtn icon="swap-horizontal" label="transfer" onPress={() => {}} />
          </View>
        )}

        {/* hangup */}
        <View className="mt-4 items-center">
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              hangup();
            }}
            className="h-[68px] w-[68px] items-center justify-center rounded-full bg-danger active:opacity-90"
          >
            <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
