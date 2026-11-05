// Runs on the Veo Analytics app and relays between the page and the extension:
//
//   page  -- window.postMessage -->  bridge  -- chrome.runtime.sendMessage -->  background
//   page  <-- window.postMessage --  bridge  <-- chrome.tabs.sendMessage   --  background
//
// src/lib/veo-extension.ts is the page's side of this protocol.
(() => {
  // Replaces any copy left behind by an earlier version of the extension, whose
  // chrome.runtime stops working once the extension is reloaded.
  try {
    window.__veoBridgeDispose?.();
  } catch {
    // The old context is already gone.
  }

  const COMMANDS = new Set([
    "PING",
    "DISCOVER_TEAMS",
    "DISCOVER_GAMES",
    "START_IMPORT",
    "CANCEL_IMPORT",
  ]);

  function post(message) {
    window.postMessage({ source: "veo-analytics-extension", ...message }, location.origin);
  }

  function onWindowMessage(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const { source, id, type, payload } = event.data ?? {};
    if (source !== "veo-analytics-app" || !COMMANDS.has(type)) return;

    if (!chrome.runtime?.id) {
      dispose();
      return;
    }
    chrome.runtime.sendMessage({ type: "VEO_APP_COMMAND", command: type, payload }).then(
      (response) => post({ id, response }),
      (error) => post({ id, response: { ok: false, error: error?.message ?? String(error) } }),
    );
  }

  function onRuntimeMessage(message) {
    if (message?.type === "VEO_APP_EVENT") post({ event: message.event });
  }

  function dispose() {
    window.removeEventListener("message", onWindowMessage);
    chrome.runtime?.onMessage?.removeListener(onRuntimeMessage);
  }

  window.addEventListener("message", onWindowMessage);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  window.__veoBridgeDispose = dispose;
})();
