const REPORT_URL = /^https:\/\/app\.veo\.co\/matches\/[^/]+\/report/;

const scrapeButton = document.getElementById("scrape");
const sendButton = document.getElementById("send");
const copyButton = document.getElementById("copy");
const statusEl = document.getElementById("status");
const warningsEl = document.getElementById("warnings");
const actionsEl = document.getElementById("actions");

let scraped = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "";
}

function showWarnings(warnings) {
  warningsEl.replaceChildren(
    ...warnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }),
  );
  warningsEl.hidden = warnings.length === 0;
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

// URL-safe base64 of UTF-8 JSON. src/lib/veo.ts holds the matching decoder.
function encodePayload(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

scrapeButton.addEventListener("click", async () => {
  scraped = null;
  actionsEl.hidden = true;
  showWarnings([]);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !REPORT_URL.test(tab.url ?? "")) {
    setStatus("Open a Veo match report first: app.veo.co/matches/…/report", true);
    return;
  }

  scrapeButton.disabled = true;
  setStatus("Scraping… keep this popup open.");
  try {
    const result = await requestScrape(tab.id);
    if (!result?.ok) {
      setStatus(result?.error ?? "The scrape returned nothing.", true);
      return;
    }
    scraped = result.data;
    const playerCount = scraped.players.rows.length;
    const teamStatCount = Object.keys(scraped.teamStats).length;
    setStatus(`Scraped ${playerCount} players and ${teamStatCount} team stats.`);
    showWarnings(scraped.warnings);
    actionsEl.hidden = false;
  } catch (error) {
    setStatus(`Scrape failed: ${error?.message ?? error}`, true);
  } finally {
    scrapeButton.disabled = false;
  }
});

sendButton.addEventListener("click", async () => {
  if (!scraped) return;
  const response = await chrome.runtime.sendMessage({
    type: "VEO_SEND_TO_APP",
    encoded: encodePayload(scraped),
  });
  if (!response?.ok) setStatus(`Could not open the app: ${response?.error}`, true);
});

copyButton.addEventListener("click", async () => {
  if (!scraped) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(scraped, null, 2));
    setStatus("JSON copied. Paste it on the Import Game page.");
  } catch (error) {
    setStatus(`Copy failed: ${error?.message ?? error}`, true);
  }
});
