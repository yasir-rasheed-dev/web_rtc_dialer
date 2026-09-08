import { useEffect } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/theme/ThemeProvider";
import { useSession } from "@/store/session";
import { useCall } from "@/store/call";
import { useChat } from "@/store/chat";
import IncomingCall from "@/components/IncomingCall";

export default function AgentLayout() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const { session } = useSession();
  const { init, teardown } = useCall();
  const chatConnect = useChat((s) => s.connect);
  const chatDisconnect = useChat((s) => s.disconnect);
  const unread = useChat((s) => s.unreadTotal);

  // SIP engine as soon as an agent with a SIP account is signed in.
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

  // Team Chat (Firebase) — connect once the session is up.
  useEffect(() => {
    if (!session?.user?.id || !session.tenant?.id) return;
    chatConnect({ id: session.user.id, name: session.user.name }, session.tenant.id);
    return () => chatDisconnect();
  }, [session?.user?.id, session?.tenant?.id]);

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
          name="chat"
          options={{
            title: "Chat",
            tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} />
          }}
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
