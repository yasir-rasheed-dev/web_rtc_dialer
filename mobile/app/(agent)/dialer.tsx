import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/store/session";

const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""]
];

// Phase 0 shell — the keypad + number field. Phase 1 wires the sip.js /
// react-native-webrtc client and pushes to the active-call screen.
export default function Dialer() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [number, setNumber] = useState("");

  const press = (k: string) => {
    Haptics.selectionAsync();
    setNumber((n) => (n + k).slice(0, 24));
  };
  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber((n) => n.slice(0, -1));
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-xl font-extrabold text-text">Dialer</Text>
        <Text className="text-[12px] text-muted">{session?.sip?.username ?? "no SIP account"}</Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <Animated.Text entering={FadeIn} className="min-h-[44px] text-4xl font-light tracking-wider text-text">
          {number || " "}
        </Animated.Text>
      </View>

      <View className="items-center px-8 pb-2">
        <View className="w-full max-w-[300px] flex-row flex-wrap justify-between">
          {KEYS.map(([digit, letters]) => (
            <Pressable
              key={digit}
              onPress={() => press(digit)}
              className="mb-4 h-[68px] w-[68px] items-center justify-center rounded-full bg-surface-2 active:bg-brand/20"
            >
              <Text className="text-2xl font-medium text-text">{digit}</Text>
              {letters ? <Text className="text-[10px] tracking-[2px] text-muted">{letters}</Text> : null}
            </Pressable>
          ))}
        </View>

        <View className="mb-4 w-full max-w-[300px] flex-row items-center justify-between">
          <View className="w-[68px]" />
          <Pressable
            disabled={!number}
            className="h-[68px] w-[68px] items-center justify-center rounded-full bg-success active:opacity-90 disabled:opacity-40"
            onPress={() => {
              /* Phase 1: startCall(number) → navigate to /(agent)/call/[id] */
            }}
          >
            <Ionicons name="call" size={30} color="#fff" />
          </Pressable>
          <Pressable onPress={back} disabled={!number} className="h-[68px] w-[68px] items-center justify-center disabled:opacity-30">
            <Ionicons name="backspace-outline" size={26} color="#8293a0" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
