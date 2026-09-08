import { io, type Socket } from "socket.io-client";

import { CONFIG } from "./config";
import { getAccessToken } from "./auth";

// Same realtime channel the web app uses — call:update / call:ended /
// agent:status / presence:update, plus auth:force-logout / auth:session-
// superseded. The socket authenticates with the current access token and
// re-sends it on every (re)connect.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(CONFIG.apiBase, {
    path: "/socket.io",
    transports: ["websocket"],
    autoConnect: false,
    auth: (cb) => cb({ token: getAccessToken() })
  });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
