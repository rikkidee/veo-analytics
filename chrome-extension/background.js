// Coordinates everything that crosses tabs: team and game discovery, and the
// batch import. The wizard in the app drives it through bridge.js.

const APP_URLS = ["http://localhost:3000", "https://veo-analytics.vercel.app"];
// Opened by the popup when no app tab is already open.
const DEFAULT_APP_URL = "https://veo-analytics.vercel.app";
const WIZARD_PATH = "/onboarding/games";
const APP_MATCH_PATTERNS = APP_URLS.map((url) => `${url}/*`);

const VEO_ORIGIN = "https://app.veo.co";
const VEO_MATCH_PATTERN = `${VEO_ORIGIN}/*`;
const SLUG_PATTERN = /^[\w.~-]+$/;

const PAGE_LOAD_TIMEOUT_MS = 30_000;
const DISCOVERY_TIMEOUT_MS = 60_000;
const SCRAPE_TIMEOUT_MS = 60_000;
const BETWEEN_GAMES_MS = 750;
const KEEP_ALIVE_MS = 20_000;

let activeJob = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const describeError = (error) => error?.message ?? String(error);

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const finish = (settle) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      settle();
    };
    // A new window's blank page also reports "complete", and must not count.
    // tab.url is undefined on sites without host permission, such as a sign-in
    // redirect; that page has loaded, and the read that follows reports the problem.
    const onUpdated = (updatedId, change, tab) => {
      if (updatedId !== tabId || change.status !== "complete") return;
      if (tab.url === undefined || /^https?:/.test(tab.url)) finish(resolve);
    };
    const onRemoved = (removedId) => {
      if (removedId === tabId) {
        finish(() => reject(new Error("The Veo import window was closed.")));
      }
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("The Veo page took too long to load."))),
      PAGE_LOAD_TIMEOUT_MS,
    );
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function navigate(tabId, url) {
  const loaded = waitForTabLoad(tabId);
  await chrome.tabs.update(tabId, { url });
  await loaded;
}

// Veo is a single-page app, so a tab may have no listener yet. Inject and retry.
async function askVeoTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

// Browsers throttle hidden tabs and can stop them rendering, which would stall
// the report. A separate unfocused window keeps Veo rendering while the user
// watches progress in the app.
async function openWorkerWindow(url) {
  const created = await chrome.windows.create({ focused: false, width: 1280, height: 900 });
  const tabId = created.tabs[0].id;
  await navigate(tabId, url);
  return { windowId: created.id, tabId };
}

async function closeWindow(windowId) {
  try {
    await chrome.windows.remove(windowId);
  } catch {
    // The user already closed it.
  }
}

// ---- Discovery ----------------------------------------------------------------

async function discoverTeams() {
  const tabs = await chrome.tabs.query({ url: VEO_MATCH_PATTERN });
  if (tabs.length === 0) return { ok: true, veoOpen: false, onClubPage: false, teams: [] };

  const teams = new Map();
  let onClubPage = false;
  for (const tab of tabs) {
    try {
      const result = await withTimeout(
        askVeoTab(tab.id, { type: "VEO_DISCOVER_TEAMS" }),
        5_000,
        "Timed out reading teams.",
      );
      if (!result?.ok) continue;
      onClubPage ||= result.onClubPage;
      for (const team of result.teams) teams.set(team.id, team);
    } catch {
      // A tab that can't answer (still loading, or discarded) shouldn't hide the others.
    }
  }
  return { ok: true, veoOpen: true, onClubPage, teams: [...teams.values()] };
}

function validRecordingsUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === VEO_ORIGIN && url.pathname.startsWith("/clubs/") ? url.href : null;
  } catch {
    return null;
  }
}

async function discoverGames(payload) {
  const url = validRecordingsUrl(payload?.team?.recordingsUrl);
  if (!url) return { ok: false, error: "That team has no valid Veo recordings address." };

  const worker = await openWorkerWindow(url);
  try {
    const result = await withTimeout(
      askVeoTab(worker.tabId, { type: "VEO_DISCOVER_GAMES", teamName: payload.team.name }),
      DISCOVERY_TIMEOUT_MS,
      "Timed out reading the recordings page.",
    );
    return result ?? { ok: false, error: "The recordings page returned nothing." };
  } finally {
    await closeWindow(worker.windowId);
  }
}

// ---- Batch import --------------------------------------------------------------

async function readReport(tabId) {
  const result = await withTimeout(
    askVeoTab(tabId, { type: "VEO_SCRAPE" }),
    SCRAPE_TIMEOUT_MS,
    "Timed out reading this match report.",
  );
  return result ?? { ok: false, error: "The match report returned nothing." };
}

async function runImport(job, slugs) {
  const sendEvent = (event) =>
    chrome.tabs.sendMessage(job.appTabId, { type: "VEO_APP_EVENT", event });

  // An extension API call resets the service worker's idle timer, so a long
  // import isn't shut down between messages.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), KEEP_ALIVE_MS);
  let worker = null;
  let failure = null;

  try {
    for (const [index, slug] of slugs.entries()) {
      if (job.cancelled) break;
      await sendEvent({ type: "IMPORT_PROGRESS", slug, completed: index, total: slugs.length });

      let result;
      try {
        const reportUrl = `${VEO_ORIGIN}/matches/${slug}/report`;
        if (worker) await navigate(worker.tabId, reportUrl);
        else worker = await openWorkerWindow(reportUrl);
        result = await readReport(worker.tabId);
      } catch (error) {
        result = { ok: false, error: describeError(error) };
      }
      await sendEvent({ type: "IMPORT_GAME_RESULT", slug, result });

      // Without the window, every remaining game would fail the same way.
      if (worker && !(await chrome.tabs.get(worker.tabId).catch(() => null))) {
        failure = "The Veo import window was closed.";
        break;
      }
      await sleep(BETWEEN_GAMES_MS);
    }
    await sendEvent({ type: "IMPORT_DONE", cancelled: job.cancelled, error: failure });
  } catch (error) {
    // Sending failed, so the app tab is gone and nothing can receive more results.
    console.warn("Import stopped:", describeError(error));
  } finally {
    clearInterval(keepAlive);
    if (worker) await closeWindow(worker.windowId);
    activeJob = null;
  }
}

function startImport(payload, appTabId) {
  if (activeJob) return { ok: false, error: "An import is already running." };

  const slugs = payload?.slugs;
  if (!Array.isArray(slugs) || slugs.length === 0 || !slugs.every((slug) => SLUG_PATTERN.test(slug))) {
    return { ok: false, error: "That list of games isn't valid." };
  }
  activeJob = { appTabId, cancelled: false };
  runImport(activeJob, slugs);
  return { ok: true };
}

// ---- Messages ------------------------------------------------------------------

async function handleAppCommand({ command, payload }, sender) {
  switch (command) {
    case "PING":
      return { ok: true, version: chrome.runtime.getManifest().version };
    case "DISCOVER_TEAMS":
      return discoverTeams();
    case "DISCOVER_GAMES":
      return discoverGames(payload);
    case "START_IMPORT":
      return startImport(payload, sender.tab.id);
    case "CANCEL_IMPORT":
      if (activeJob) activeJob.cancelled = true;
      return { ok: true };
    default:
      return { ok: false, error: `Unknown command: ${command}` };
  }
}

async function openApp() {
  const [tab] = await chrome.tabs.query({ url: APP_MATCH_PATTERNS });
  if (!tab) {
    await chrome.tabs.create({ url: `${DEFAULT_APP_URL}${WIZARD_PATH}` });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true, url: new URL(WIZARD_PATH, tab.url).href });
  await chrome.windows.update(tab.windowId, { focused: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  let work = null;
  if (message?.type === "VEO_APP_COMMAND" && sender.tab && APP_URLS.includes(sender.origin)) {
    work = handleAppCommand(message, sender);
  } else if (message?.type === "VEO_OPEN_APP") {
    work = openApp().then(() => ({ ok: true }));
  }
  if (!work) return;

  work.then(sendResponse, (error) => sendResponse({ ok: false, error: describeError(error) }));
  return true; // Keeps the channel open for the async response.
});

// Tabs opened before the extension was installed or reloaded have no bridge, and
// the wizard would report "not detected" until they were refreshed.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: APP_MATCH_PATTERNS });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["bridge.js"] })
      .catch(() => {});
  }
});
