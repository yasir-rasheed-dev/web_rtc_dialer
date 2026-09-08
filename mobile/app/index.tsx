import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";

import { useSession } from "@/store/session";
import { homeRoute } from "@/lib/permissions";

// Entry route — bounce to login or the role home once the session boots.
export default function Index() {
  const { status, session } = useSession();

  if (status === "boot") {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#0684BC" size="large" />
      </View>
    );
  }
  if (status === "guest") return <Redirect href="/(auth)/login" />;
  return <Redirect href={homeRoute(session)} />;
}
