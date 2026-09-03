// Dedicated page opened in its own popup window so Chrome shows the real
// microphone prompt (the side panel can't). On success it tells the
// extension and closes itself.
const btn = document.getElementById("go");
const msg = document.getElementById("msg");
const t = document.getElementById("t");
const d = document.getElementById("d");

function fail(text) {
  msg.textContent = text;
  msg.hidden = false;
  msg.className = "err";
}

async function request() {
  msg.hidden = true;
  btn.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
    t.textContent = "Microphone allowed";
    d.textContent = "You can close this window.";
    btn.hidden = true;
    msg.textContent = "Done — returning to the dialer…";
    msg.className = "ok";
    msg.hidden = false;
    chrome.runtime.sendMessage({ type: "mic:granted" }).catch(() => {});
    setTimeout(() => window.close(), 900);
  } catch (e) {
    btn.disabled = false;
    if (e && e.name === "NotAllowedError") {
      fail("Access was blocked. Open the padlock in the address bar (or chrome://settings/content/microphone) and allow it, then try again.");
    } else {
      fail("Could not access a microphone: " + (e?.message || e));
    }
  }
}

btn.addEventListener("click", request);

// If it's already granted, finish immediately.
navigator.permissions?.query({ name: "microphone" }).then((p) => {
  if (p.state === "granted") request();
}).catch(() => {});
