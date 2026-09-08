import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/theme/ThemeProvider";

export default function AgentLayout() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0684BC",
        tabBarInactiveTintColor: dark ? "#647a8c" : "#8293a0",
        tabBarStyle: {
          backgroundColor: dark ? "#101922" : "#ffffff",
          borderTopColor: dark ? "#1c2833" : "#e3e9ee"
        }
      }}
    >
      <Tabs.Screen
        name="dialer"
        options={{ title: "Dialer", tabBarIcon: ({ color, size }) => <Ionicons name="keypad" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="logs"
        options={{ title: "Calls", tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
