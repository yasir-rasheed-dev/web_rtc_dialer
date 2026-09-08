import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
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
  disabled,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ opacity: disabled ? 0.35 : 1 }}
      className="w-[33%] items-center gap-2 py-2"
    >
      <View
        className={
          "h-[64px] w-[64px] items-center justify-center rounded-full " + (active ? "bg-white" : "bg-white/15")
        }
      >
        <Ionicons name={icon} size={26} color={active ? "#0d1524" : "#fff"} />
      </View>
      <Text className="text-[12px] text-white/70">{label}</Text>
    </Pressable>
  );
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    snap,
    hangup,
    toggleMute,
    toggleHold,
    toggleSpeaker,
    dtmf,
    startWarmTransfer,
    completeTransfer,
    cancelWarmTransfer
  } = useCall();

  const [pad, setPad] = useState(false);
  const [typed, setTyped] = useState("");
  const [xferOpen, setXferOpen] = useState(false);
  const [xferTarget, setXferTarget] = useState("");

  const elapsed = useElapsed(snap.connectedAt);
  const ringing = snap.status === "dialing" || snap.status === "ringing";
  const transferring = !!snap.transfer;
  const party = snap.party;

  const startedRef = useRef(false);
  useEffect(() => {
    if (snap.status !== "idle" && snap.status !== "ended") startedRef.current = true;
    if (snap.status === "ended") {
      const t = setTimeout(() => router.back(), 180);
      return () => clearTimeout(t);
    }
    if (snap.status === "idle") {
      const t = setTimeout(
        () => {
          if (useCall.getState().snap.status === "idle") router.back();
        },
        startedRef.current ? 0 : 800
      );
      return () => clearTimeout(t);
    }
  }, [snap.status]);

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

  const statusText = transferring
    ? snap.transfer!.phase === "completing"
      ? "Completing transfer…"
      : `On hold · consulting ${snap.transfer!.target}`
    : snap.status === "dialing"
      ? "Calling…"
      : snap.status === "ringing"
        ? "Ringing…"
        : snap.status === "held"
          ? "On hold"
          : snap.status === "ended"
            ? snap.endedReason === "transferred"
              ? "Transferred"
              : "Call ended"
            : mmss(elapsed);

  const tap = (d: string) => {
    Haptics.selectionAsync();
    setTyped((t) => (t + d).slice(0, 32));
    dtmf(d);
  };

  const beginTransfer = () => {
    const t = xferTarget.replace(/[^\d+*#]/g, "");
    if (!t) return;
    setXferOpen(false);
    setXferTarget("");
    Haptics.selectionAsync();
    startWarmTransfer(t);
  };

  const canControl = snap.status === "active" || snap.status === "held";

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
        {transferring ? (
          <Animated.View entering={FadeIn} className="items-center gap-4">
            <Text className="text-center text-[13px] text-white/60">
              Talk to {snap.transfer!.target}, then complete to connect them and drop off.
            </Text>
            <View className="w-full flex-row gap-3">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  cancelWarmTransfer();
                }}
                className="h-12 flex-1 items-center justify-center rounded-2xl bg-white/15 active:opacity-80"
              >
                <Text className="text-[15px] font-semibold text-white">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  completeTransfer();
                }}
                disabled={snap.transfer!.phase === "completing"}
                className="h-12 flex-1 items-center justify-center rounded-2xl bg-success active:opacity-90"
              >
                <Text className="text-[15px] font-semibold text-white">Complete transfer</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : pad ? (
          <Animated.View entering={FadeIn} className="items-center">
            <Keypad variant="dtmf" size={64} onPress={tap} />
            <Pressable onPress={() => setPad(false)} className="mt-3 px-4 py-2">
              <Text className="text-[14px] font-semibold text-white/70">Hide</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View className="flex-row flex-wrap">
            <CircleBtn icon={snap.muted ? "mic-off" : "mic"} label="mute" active={snap.muted} onPress={toggleMute} />
            <CircleBtn icon="keypad" label="keypad" disabled={!canControl} onPress={() => setPad(true)} />
            <CircleBtn
              icon={snap.speaker ? "volume-high" : "volume-medium"}
              label="speaker"
              active={snap.speaker}
              onPress={toggleSpeaker}
            />
            <CircleBtn
              icon="pause"
              label={snap.held ? "resume" : "hold"}
              active={snap.held}
              disabled={!canControl}
              onPress={toggleHold}
            />
            <CircleBtn
              icon="swap-horizontal"
              label="transfer"
              disabled={snap.status !== "active"}
              onPress={() => setXferOpen(true)}
            />
            <CircleBtn icon="person-add" label="add" disabled onPress={() => {}} />
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

      {/* warm-transfer target */}
      <Modal visible={xferOpen} transparent animationType="fade" onRequestClose={() => setXferOpen(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/60 px-8" onPress={() => setXferOpen(false)}>
          <Pressable className="w-full rounded-2xl bg-[#141d2e] p-5" onPress={() => {}}>
            <Text className="text-base font-bold text-white">Warm transfer</Text>
            <Text className="mt-1 text-[12px] text-white/50">
              Enter an agent extension or a number. The current call goes on hold while you consult.
            </Text>
            <TextInput
              value={xferTarget}
              onChangeText={setXferTarget}
              keyboardType="phone-pad"
              autoFocus
              placeholder="e.g. 2002"
              placeholderTextColor="#5b6b82"
              className="mt-4 h-12 rounded-xl bg-white/10 px-4 text-[16px] text-white"
            />
            <View className="mt-4 flex-row justify-end gap-3">
              <Pressable onPress={() => setXferOpen(false)} className="px-4 py-2.5">
                <Text className="text-[14px] font-semibold text-white/60">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={beginTransfer}
                disabled={!xferTarget.trim()}
                className="rounded-xl bg-brand px-5 py-2.5 disabled:opacity-40"
              >
                <Text className="text-[14px] font-semibold text-white">Consult</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
