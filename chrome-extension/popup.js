const REPORT_URL = /^https:\/\/app\.veo\.co\/matches\/[^/]+\/report/;

const openButton = document.getElementById("open");
const copyButton = document.getElementById("copy");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
}

async function requestScrape(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "VEO_SCRAPE" });
  } catch {
    // No listener: the tab reached the report through in-app navigation, so
    // the declared content script never ran. Inject it and try once more.
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "VEO_SCRAPE" });
  }
}

openButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "VEO_OPEN_APP" });
  if (!response?.ok) setStatus(`Could not open the app: ${response?.error}`, true);
});

// A diagnostic for when an import looks wrong: shows exactly what was read.
copyButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !REPORT_URL.test(tab.url ?? "")) {
    setStatus("Open a Veo match report first: app.veo.co/matches/…/report", true);
    return;
  }

  copyButton.disabled = true;
  setStatus("Reading the report… keep this popup open.");
  try {
    const result = await requestScrape(tab.id);
    if (!result?.ok) {
      setStatus(result?.error ?? "The report returned nothing.", true);
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
    setStatus(`Copied ${result.data.players.rows.length} players as JSON.`);
  } catch (error) {
    setStatus(`Copy failed: ${error?.message ?? error}`, true);
  } finally {
    copyButton.disabled = false;
  }
});
