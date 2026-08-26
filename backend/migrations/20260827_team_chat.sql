-- Team Chat: FCM push token storage (chat messages themselves live in
-- Firebase Realtime Database, tenant-namespaced — see teamChatRoutes.js).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255) NULL;
