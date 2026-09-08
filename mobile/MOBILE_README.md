# ringNex Mobile (Expo — iOS + Android)

React Native app built with **Expo SDK 57** (React 19 / RN 0.86, new
architecture). It wraps the same backend the web/desktop/extension use
(`https://demoapi.ringnex.co`) — same auth, refresh tokens, socket
events. Owner **and** agent log in with workspace + email + password
(+ 2FA).

> **Phase 0 runs in Expo Go** (SDK 57) — nothing native-only is imported
> yet. **From Phase 1 you need a development build** (`expo-dev-client` +
> `eas build`): SIP calling pulls in `react-native-webrtc`, which Expo Go
> doesn't ship. Still managed Expo — you never hand-edit `ios/` or
> `android/`.
>
> `npm` needs `legacy-peer-deps=true` on this stack (React 19 peer
> ranges) — it's set in `.npmrc`, committed.

## Current state — Phase 0 (scaffold)

Done in this folder:
- Expo SDK 57 + expo-router 57 + NativeWind 4.2 + Reanimated 4 + theme
- **Light / Dark / System** theme (persisted, animated), ringNex Blue/Orange tokens
- Auth: login + 2FA + **refresh-token session** stored in the OS keychain
  (`expo-secure-store`) — closing/killing the app never logs you out
- API layer (`src/lib/api.ts`) and socket client ported from the web app
- Role routing: SIP agents → `(agent)/dialer`, everyone else → `(owner)/dashboard`
- Screens: **login**, **dialer keypad** (shell), **call logs** (live, filters),
  **owner dashboard** (KPIs), **settings**

## Next phases

| Phase | Scope |
|---|---|
| **1** | `sip.js` + `react-native-webrtc` client · outgoing call · active-call screen (iPhone-style) · mute / hold / DTMF / speaker / hangup · agent status. **An in-progress call keeps running in the background until it ends.** |
| **2** | `react-native-callkeep` (CallKit / ConnectionService) · **foreground + background incoming call** screen (native ring UI) · then VoIP push (PushKit) + FCM for killed-app calls |
| **3** | Warm / blind transfer · add participant / conference · voicemail · contacts · click-to-dial · auto-dialer agent mode |
| **4** | Owner: live calls board · presence · reports (date range) · supervisor listen / whisper / barge · Team Chat (Firebase) · animation polish |
| **5** | Icons/splash · store listings · TestFlight + Play internal · EAS Update (OTA) · first release |

## Run it

```bash
cd mobile
npm install                  # .npmrc already forces legacy-peer-deps

# --- Phase 0: quick preview in Expo Go (SDK 57 build) ---
npx expo start --go          # scan the QR with Expo Go, same Wi-Fi

# --- Phase 1+ : real app (calling needs native modules) ---
npx expo install react-native-webrtc @config-plugins/react-native-webrtc
#   re-add the config plugin to app.json plugins, then:
eas build --profile development --platform android    # (or ios on a Mac) — ~15 min
#   install the resulting .apk on the phone, then:
npx expo start --dev-client
```

EAS project is already linked (`b7598267…`, owner `yasirdeveloper`) and
`expo-updates` is wired for OTA. gluestack-ui: use **v2 stable**
(`npx gluestack-ui@2 init`) — `@latest` is a v5 alpha and not safe to
build on.

Android FCM later needs `google-services.json`; iOS VoIP push needs an
Apple **VoIP Services** certificate (`.p8`/`.p12`) added to EAS
credentials — both are Phase 2.

## Config

Backend URL / SIP domain live in `app.json → expo.extra` and are read via
`src/lib/config.ts`. Change there (or per-profile with an EAS env var) if
you point the app at a different backend.

## Layout

```
app/                       expo-router routes
  _layout.tsx              providers + auth gate
  (auth)/login.tsx
  (agent)/{dialer,logs,settings}.tsx
  (owner)/{dashboard,settings}.tsx
src/
  lib/     config · api (refresh) · auth (secure-store) · socket · permissions
  store/   session (zustand)
  theme/   ThemeProvider (light/dark/system)
  screens/ shared screens re-used by route files
```
