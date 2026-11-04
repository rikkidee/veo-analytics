// Point this at the deployed app when there is one.
const APP_URL = "http://localhost:3000";

// Opening a tab closes the popup, so the service worker does it on the popup's behalf.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "VEO_SEND_TO_APP") return;

  // The payload travels in the URL fragment, which is never sent to a server.
  // The import page reads it and then removes it from the address bar.
  const url = `${APP_URL}/onboarding/games#import=${message.encoded}`;
  chrome.tabs.create({ url }).then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: String(error) }),
  );
  return true;
});
