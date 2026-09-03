// Click-to-dial. Two entry points on any page:
//   1. tel: links get a small "call with ringNex" button on hover.
//   2. Plain-text phone numbers get wrapped in a clickable chip.
// Clicking either sends the number to the extension, which opens the side
// panel and dials.

(function () {
  const RX = /(?:\+?\d[\d\s().\-]{7,}\d)/g; // loose, min ~9 digits
  const MIN_DIGITS = 8, MAX_DIGITS = 15;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "A", "BUTTON", "INPUT", "SELECT"]);
  let hoverBtn = null;

  function digits(s) { return String(s).replace(/[^\d+]/g, "").replace(/^\+/, ""); }
  function valid(s) { const d = digits(s); return d.length >= MIN_DIGITS && d.length <= MAX_DIGITS; }

  function dial(number) {
    chrome.runtime.sendMessage({ type: "page-dial", number: digits(number) });
  }

  /* ---- tel: links ---- */
  function attachTelHover() {
    document.addEventListener(
      "mouseover",
      (e) => {
        const a = e.target.closest && e.target.closest('a[href^="tel:"]');
        if (!a) return;
        const num = decodeURIComponent(a.getAttribute("href").slice(4));
        if (!valid(num)) return;
        showHover(a, num);
      },
      true
    );
  }
  function showHover(anchor, num) {
    removeHover();
    const r = anchor.getBoundingClientRect();
    hoverBtn = document.createElement("button");
    hoverBtn.className = "rnx-dial-hover";
    hoverBtn.textContent = "📞 ringNex";
    hoverBtn.style.top = window.scrollY + r.top - 6 + "px";
    hoverBtn.style.left = window.scrollX + r.right + 6 + "px";
    hoverBtn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); dial(num); removeHover(); });
    document.body.appendChild(hoverBtn);
    setTimeout(() => document.addEventListener("mousemove", maybeRemove, true), 50);
  }
  function maybeRemove(e) {
    if (hoverBtn && !hoverBtn.contains(e.target) && !e.target.closest?.('a[href^="tel:"]')) removeHover();
  }
  function removeHover() {
    document.removeEventListener("mousemove", maybeRemove, true);
    hoverBtn?.remove(); hoverBtn = null;
  }

  /* ---- plain-text numbers ---- */
  function scan(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length < MIN_DIGITS) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || SKIP.has(p.tagName) || p.isContentEditable || p.closest(".rnx-dial-chip")) return NodeFilter.FILTER_REJECT;
        return RX.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    targets.slice(0, 400).forEach(wrap);
  }
  function wrap(textNode) {
    const text = textNode.nodeValue;
    RX.lastIndex = 0;
    let m, last = 0;
    const frag = document.createDocumentFragment();
    let any = false;
    while ((m = RX.exec(text))) {
      if (!valid(m[0])) continue;
      any = true;
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const chip = document.createElement("span");
      chip.className = "rnx-dial-chip";
      chip.textContent = m[0];
      chip.title = "Call with ringNex";
      chip.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); dial(m[0]); });
      frag.appendChild(chip);
      last = m.index + m[0].length;
    }
    if (!any) return;
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  attachTelHover();
  const start = () => scan(document.body);
  if (document.readyState === "complete" || document.readyState === "interactive") start();
  else document.addEventListener("DOMContentLoaded", start);

  // catch content added later (SPA), throttled
  let pending = false;
  new MutationObserver((muts) => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      muts.forEach((mu) => mu.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && !node.classList?.contains("rnx-dial-chip")) scan(node);
      }));
    }, 800);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
