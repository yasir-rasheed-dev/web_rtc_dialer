import { useEffect } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/theme/ThemeProvider";
import { useSession } from "@/store/session";
import { useCall } from "@/store/call";
import IncomingCall from "@/components/IncomingCall";

export default function AgentLayout() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const { session } = useSession();
  const { init, teardown } = useCall();

  // Register the SIP engine (real on a dev build, simulated in Expo Go)
  // as soon as an agent with a SIP account is signed in.
  useEffect(() => {
    const sip = session?.sip;
    if (!sip?.username) return;
    init({
      username: sip.username,
      password: sip.password,
      domain: sip.domain,
      wssUrl: sip.wssUrl,
      displayName: sip.displayName
    });
    return () => teardown();
  }, [session?.sip?.username]);

  return (
    <View className="flex-1">
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
        {/* full-screen active-call view — reachable via router.push, not a tab */}
        <Tabs.Screen name="call" options={{ href: null, tabBarStyle: { display: "none" } }} />
      </Tabs>

      <IncomingCall />
    </View>
  );
}
