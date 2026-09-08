import "../global.css";

import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { useSession } from "@/store/session";
import { onAuthExpired } from "@/lib/api";
import { homeRoute } from "@/lib/permissions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } }
});

function AuthGate() {
  const { status, session, bootstrap } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    bootstrap();
    const off = onAuthExpired(() => useSession.setState({ session: null, status: "guest" }));
    return () => off();
  }, []);

  useEffect(() => {
    if (status === "boot") return;
    const inAuthGroup = segments[0] === "(auth)";
    if (status === "guest" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (status === "authed" && inAuthGroup) {
      router.replace(homeRoute(session));
    }
  }, [status, segments, session]);

  return <Slot />;
}

function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ThemedStatusBar />
            <AuthGate />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
