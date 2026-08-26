// Per-user "last seen" timestamps for Team Chat conversations, keyed by
// chatKey (e.g. "individual_<id>", "group_<id>", "custom-group_<id>").
// Stored client-side only — this is a per-device read receipt, not synced
// data, so a message opened on one device still shows unread on another.
const KEY_PREFIX = "ringnex.teamChat.seenMap.";

export function loadSeenMap(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSeenMap(map, userId) {
  if (!userId) return;
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(map));
  } catch {
    // Private browsing / storage full — unread counts just won't persist across reloads.
  }
}

// msgs: an object keyed by Firebase push id (or index), values are message records.
export function countUnread(msgs, userId, seenTs) {
  if (!msgs) return 0;
  return Object.values(msgs).filter((m) => {
    if (!m || m.senderId == userId) return false;
    const ts = typeof m.timestamp === "number" && m.timestamp > 0 ? m.timestamp : m.time ? new Date(m.time).getTime() : 0;
    return ts > (seenTs || 0);
  }).length;
}
