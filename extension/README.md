# ringNex Dialer — Chrome extension

An MV3 softphone for **agents** (accounts with a SIP endpoint). Talks to the
live backend at `https://demoapi.ringnex.co`.

## What it does

- **Sign in** with workspace + email + password (2FA supported). Accounts
  with no SIP endpoint (e.g. Tenant Owner) are refused.
- **Dialer tab** — keypad + number field. During a call: **Mute**, **Hold**,
  **Keypad (DTMF)**, **Warm transfer** (consult an agent, then Complete),
  **Add party** (pull a PSTN number into a conference), **Hang up**. Inbound
  calls show **Answer / Decline**.
- **Call Logs tab** — date range (Today / This week / This month / Custom
  from–to) × sub-tabs **Outgoing / Inbound / Missed / Voicemail**. Tap a row
  to load that number into the dialer; play voicemails inline.
- **Click-to-dial on any page** — `tel:` links get a hover "call" button,
  plain-text phone numbers become clickable chips, and right-click →
  *Dial "…" with ringNex*. Any of them opens the panel and calls.

## Build

The SIP engine (`src/offscreen.js` + `sip.js`) is bundled to
`offscreen.bundle.js`. It's committed, so you only need this after changing
`src/offscreen.js`:

```bash
cd extension
npm install
npm run build
```

## Load it in Chrome

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.
3. Click the ringNex icon (or pin it) → the **side panel** opens → sign in.
4. On first sign-in Chrome asks for **microphone** access — allow it (calls
   need it).

## How it's wired (MV3)

| Piece | Role |
|------|------|
| `sidepanel.*` | the UI — login, dialer, logs |
| `offscreen.html` + `offscreen.bundle.js` | the only context that can hold a persistent WebRTC + `getUserMedia`; runs sip.js, keeps the SIP registration alive with a silent looping audio |
| `background.js` | opens the side panel, the context-menu dial, and creates the offscreen document |
| `content.js` / `content.css` | phone-number detection + in-page "call" affordances |
| `lib/api.js` | fetch wrapper — access token + silent refresh, tokens in `chrome.storage.local` |

SIP commands/events flow directly between the side panel and the offscreen
doc over `chrome.runtime` messaging.

## Known MV3 limits

- **Inbound calls only ring while the offscreen document is alive.** The
  silent-audio keep-alive holds it open in practice, but Chrome may still
  reclaim it under memory pressure; re-opening the side panel re-registers.
- **Warm transfer / add-party** use the backend ConfBridge endpoints
  (`/api/calls/conference/*`) exactly like the web softphone, so they need
  the agent's `WARM_TRANSFER` / `ADD_PARTICIPANT` permissions.
- The **Voicemail** sub-tab needs `VIEW_VOICEMAILS`; without it that tab
  shows "Not available for your role".
