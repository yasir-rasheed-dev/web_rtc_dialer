import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AP = Animated.createAnimatedComponent(Pressable);

// iPhone keypad geometry: a 3×4 grid, columns spread with equal gaps so
// the block is perfectly symmetric and horizontally centred. Row gap is a
// touch tighter than the column gap, matching iOS rhythm.
const GAP_X = 26;
const GAP_Y = 14;

type KeyDef = { d: string; sub: string };
export const KEYPAD_KEYS: KeyDef[] = [
  { d: "1", sub: "" },
  { d: "2", sub: "ABC" },
  { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" },
  { d: "5", sub: "JKL" },
  { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" },
  { d: "8", sub: "TUV" },
  { d: "9", sub: "WXYZ" },
  { d: "*", sub: "" },
  { d: "0", sub: "+" },
  { d: "#", sub: "" }
];

// U+2217 renders as a vertically-centred asterisk (a plain "*" sits high).
const glyph = (d: string) => (d === "*" ? "∗" : d);

type Variant = "dial" | "dtmf";

function Key({
  def,
  size,
  variant,
  onPress,
  onLongPressZero
}: {
  def: KeyDef;
  size: number;
  variant: Variant;
  onPress: (d: string) => void;
  onLongPressZero?: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dtmf = variant === "dtmf";

  return (
    <AP
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 15, stiffness: 360 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 260 });
      }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress(def.d);
      }}
      onLongPress={def.d === "0" && onLongPressZero ? onLongPressZero : undefined}
      delayLongPress={350}
      style={[style, { width: size, height: size }]}
      className={
        "items-center justify-center rounded-full " +
        (dtmf ? "bg-white/[0.12] active:bg-white/25" : "bg-surface-2 active:bg-brand/10")
      }
    >
      {/* fixed-height digit box → every glyph sits at the same baseline */}
      <View style={{ height: size * 0.5, justifyContent: "center" }}>
        <Text
          allowFontScaling={false}
          style={{ fontSize: Math.round(size * 0.44), fontWeight: "300", lineHeight: Math.round(size * 0.5) }}
          className={dtmf ? "text-white" : "text-text"}
        >
          {glyph(def.d)}
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        style={{ height: size * 0.2, fontSize: 10, fontWeight: "700", letterSpacing: 1.8, lineHeight: size * 0.2 }}
        className={dtmf ? "text-white/55" : "text-muted"}
      >
        {def.sub}
      </Text>
    </AP>
  );
}

export type KeypadProps = {
  onPress: (d: string) => void;
  onLongPressZero?: () => void;
  variant?: Variant;
  /** key diameter in px */
  size?: number;
};

function Keypad({ onPress, onLongPressZero, variant = "dial", size = 74 }: KeypadProps) {
  const gridWidth = size * 3 + GAP_X * 2;
  return (
    <View style={{ width: gridWidth, alignSelf: "center" }}>
      {[0, 3, 6, 9].map((start) => (
        <View
          key={start}
          style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: start === 9 ? 0 : GAP_Y }}
        >
          {KEYPAD_KEYS.slice(start, start + 3).map((def) => (
            <Key
              key={def.d}
              def={def}
              size={size}
              variant={variant}
              onPress={onPress}
              onLongPressZero={onLongPressZero}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export const KEYPAD_GAP_X = GAP_X;
export default memo(Keypad);
