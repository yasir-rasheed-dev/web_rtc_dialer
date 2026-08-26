// Imperative modal API — the direct replacement for window.prompt()/window.confirm().
// A single <ModalHost/> (mounted once in main.jsx) registers itself here via
// _bindModalHost; promptModal/confirmModal then just hand it a config and a
// Promise resolver, mirroring window.prompt's "string or null on cancel" and
// window.confirm's "boolean" contract so existing call sites barely change:
//   const target = window.prompt("...")       ->  const target = await promptModal({...})
//   if (window.confirm("..."))                ->  if (await confirmModal({...}))

let openModal = null;

export function _bindModalHost(fn) {
  openModal = fn;
}

export function promptModal({ title = "Enter a value", label, defaultValue = "", placeholder, confirmText = "OK", cancelText = "Cancel" } = {}) {
  return new Promise((resolve) => {
    if (!openModal) {
      resolve(null);
      return;
    }
    openModal({ kind: "prompt", title, label, defaultValue, placeholder, confirmText, cancelText, resolve });
  });
}

export function confirmModal({ title = "Are you sure?", message, confirmText = "Confirm", cancelText = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    if (!openModal) {
      resolve(false);
      return;
    }
    openModal({ kind: "confirm", title, message, confirmText, cancelText, danger, resolve });
  });
}
