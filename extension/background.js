// ringNex Dialer — service worker.
// Owns: side-panel open, the "Dial with Ringnex" context menu + click-to-dial
// routing, and the lifecycle of the offscreen document that runs the SIP
// engine. SIP commands/events flow directly between the side panel and the
// offscreen doc over chrome.runtime messaging — the worker only makes sure
// the offscreen doc exists.

const OFFSCREEN_URL = "offscreen.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "rnx-dial",
    title: 'Dial "%s" with ringNex',
    contexts: ["selection", "link"]
  });
});

// Open the side panel when the toolbar icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    /* older Chrome */
  }
});
chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

// ---- click-to-dial: context menu ----
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "rnx-dial") return;
  let num = info.selectionText || "";
  if (!num && info.linkUrl && info.linkUrl.startsWith("tel:")) {
    num = decodeURIComponent(info.linkUrl.slice(4));
  }
  num = String(num).replace(/[^\d+*#]/g, "");
  if (!num) return;
  await startDial(num, tab?.windowId);
});

// ---- click-to-dial: from the in-page button (content.js) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ensure-offscreen") {
    ensureOffscreen().then(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (msg?.type === "page-dial" && msg.number) {
    startDial(String(msg.number).replace(/[^\d+*#]/g, ""), sender?.tab?.windowId);
    sendResponse?.({ ok: true });
    return false;
  }
  return false;
});

async function startDial(number, windowId) {
  try {
    if (windowId != null) await chrome.sidePanel.open({ windowId });
  } catch (e) { /* ignore */ }
  // The panel may take a moment to boot; retry the hand-off a few times.
  let tries = 0;
  const send = () => {
    chrome.runtime.sendMessage({ type: "dial-request", number }).catch(() => {});
    if (++tries < 6) setTimeout(send, 400);
  };
  send();
}

// ---- offscreen document (SIP engine host) ----
let creating = null;
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  if (creating) return creating;
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA", "WEB_RTC", "AUDIO_PLAYBACK"],
    justification: "Maintain the SIP registration and carry call audio for the softphone."
  });
  try {
    await creating;
  } finally {
    creating = null;
  }
}

// Keep the worker warm while a call/registration is active — the offscreen
// doc pings this alarm target.
chrome.alarms.onAlarm.addListener(() => {});
