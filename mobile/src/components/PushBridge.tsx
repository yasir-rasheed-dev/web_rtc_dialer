import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { useChat } from "@/store/chat";
import { pushAvailable, registerPush } from "@/lib/push";

// Registers this device for Team Chat push and routes notification taps to
// the right thread. Mount once; renders nothing. No-op in Expo Go.
export default function PushBridge() {
  const router = useRouter();
  const me = useChat((s) => s.me);
  const tenantId = useChat((s) => s.tenantId);

  useEffect(() => {
    if (!pushAvailable || !me?.id || !tenantId) return;
    registerPush();
  }, [me?.id, tenantId]);

  useEffect(() => {
    if (!pushAvailable) return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const d: any = resp.notification.request.content.data || {};
      if (d?.id && d?.kind) {
        router.push({
          pathname: "/(agent)/chat/[id]",
          params: { id: String(d.id), kind: String(d.kind), name: String(d.name || "Chat") }
        } as any);
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
