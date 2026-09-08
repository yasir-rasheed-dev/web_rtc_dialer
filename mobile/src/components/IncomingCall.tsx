import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation
} from "react-native-reanimated";

import { useCall } from "@/store/call";
import { callkeepAvailable, callkeepNativeLoaded } from "@/lib/callkeep";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Full-screen incoming-call ring UI. Rendered by the agent layout above
// the tabs; visible only while snap.status === "incoming". (The native
// OS-level lock-screen ring via CallKit/ConnectionService comes in a
// later phase — this is the in-app version.)
export default function IncomingCall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snap, answer, decline } = useCall();
  // When CallKeep's native module is present (dev/standalone build) the OS
  // shows the incoming-call UI via CallKit / ConnectionService. This in-app
  // overlay is the fallback for Expo Go *and* for builds where the CallKeep
  // native module didn't link.
  const nativeRing = callkeepAvailable && callkeepNativeLoaded;
  const visible = snap.status === "incoming" && !nativeRing;
  const party = snap.party;

  const pulse = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) }), -1, false);
      bob.value = withRepeat(withSequence(withTiming(-6, { duration: 500 }), withTiming(0, { duration: 500 })), -1, true);
    } else {
      cancelAnimation(pulse);
      cancelAnimation(bob);
      pulse.value = 0;
      bob.value = 0;
    }
  }, [visible]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.45 - pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.45 }]
  }));
  const bell = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  if (!visible) return null;

  const onAnswer = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    answer();
    router.push("/(agent)/call");
  };
  const onDecline = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    decline();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      className="absolute inset-0 z-50 bg-[#0d1524]"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }}
    >
      <View className="items-center px-8">
        <Text className="text-[13px] uppercase tracking-[2px] text-white/50">Incoming call</Text>

        <View className="my-8 h-[132px] w-[132px] items-center justify-center">
          <Animated.View style={ring} className="absolute h-[132px] w-[132px] rounded-full bg-brand" />
          <Animated.View style={bell} className="h-[120px] w-[120px] items-center justify-center rounded-full bg-white/10">
            <Text className="text-4xl font-semibold text-white">{initials(party?.name || "?")}</Text>
          </Animated.View>
        </View>

        <Text numberOfLines={1} className="text-[26px] font-semibold text-white">
          {party?.name || "Unknown"}
        </Text>
        {party?.number && party.number !== party.name ? (
          <Text className="mt-1 text-[14px] text-white/50">{party.number}</Text>
        ) : null}
      </View>

      <View className="flex-1" />

      <View className="flex-row items-end justify-around px-12">
        <View className="items-center gap-2">
          <Pressable
            onPress={onDecline}
            className="h-[72px] w-[72px] items-center justify-center rounded-full bg-danger active:opacity-90"
          >
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          <Text className="text-[12px] text-white/60">Decline</Text>
        </View>

        <View className="items-center gap-2">
          <Pressable
            onPress={onAnswer}
            className="h-[72px] w-[72px] items-center justify-center rounded-full bg-success active:opacity-90"
          >
            <Ionicons name="call" size={32} color="#fff" />
          </Pressable>
          <Text className="text-[12px] text-white/60">Accept</Text>
        </View>
      </View>
    </Animated.View>
  );
}
