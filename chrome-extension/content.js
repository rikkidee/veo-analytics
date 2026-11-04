// Veo match report scraper.
//
// Declared in the manifest for full page loads. Veo is a single-page app, so
// the popup also injects this file when you reach a report by clicking around.
// The guard keeps a second injection from registering a second listener.
(() => {
  if (window.__veoScraperLoaded) return;
  window.__veoScraperLoaded = true;

  const TARGET_COUNT = "29/33";
  const REQUIRED_COLUMNS = [
    "Passes",
    "Passes success rate",
    "Passes successful",
    "Passes unsuccessful",
    "Dribbles",
    "Duels",
    "Interceptions",
    "Loose ball recoveries",
    "Saves",
  ];
  const OPTION_SELECTOR =
    'label, button, li, [role="checkbox"], [role="option"], [role="menuitemcheckbox"], [role="switch"]';

  const normalize = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Joins text nodes with spaces so that adjacent elements stay separate:
  // <span>7</span><span>Alex</span> reads "7 Alex", not "7Alex".
  function textOf(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const tag = walker.currentNode.parentElement?.tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      const text = walker.currentNode.nodeValue.trim();
      if (text) parts.push(text);
    }
    return parts.join(" ");
  }

  async function waitFor(check, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await sleep(100);
    }
    return null;
  }

  // A bare .click() misses components that open on pointerdown, so send the
  // same event sequence a real click produces.
  function press(element) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventType =
        type.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(
        new EventType(type, { bubbles: true, cancelable: true, composed: true, view: window }),
      );
    }
  }

  function findButton(pattern) {
    return [...document.querySelectorAll('button, [role="button"]')].find((button) =>
      pattern.test(textOf(button)),
    );
  }

  function findEditColumnsButton() {
    return findButton(/edit\s+columns/i);
  }

  function isReportPage() {
    return (
      location.hostname === "app.veo.co" &&
      /^\/matches\/[^/]+\/report/.test(location.pathname)
    );
  }

  function readColumnCount() {
    const button = findEditColumnsButton();
    if (!button) return null;
    // The count may sit beside the button rather than inside it.
    const sources = [button, button.parentElement].filter(Boolean);
    for (const source of sources) {
      const match = textOf(source).match(/(\d+)\s*\/\s*(\d+)/);
      if (match) return `${match[1]}/${match[2]}`;
    }
    return null;
  }

  function findStatsTable() {
    const header = document.querySelector('table [role="columnheader"], [role="columnheader"]');
    return header?.closest('table, [role="table"], [role="grid"]') ?? null;
  }

  function readHeaders() {
    const table = findStatsTable();
    if (!table) return [];
    return [...table.querySelectorAll('[role="columnheader"]')].map(textOf);
  }

  function findColumnOption(scope, label) {
    const wanted = normalize(label);
    const matches = (element) =>
      normalize(textOf(element)) === wanted && !element.closest('table, [role="columnheader"]');

    const direct = [...scope.querySelectorAll(OPTION_SELECTOR)].find(matches);
    if (direct) return direct;

    const nested = [...scope.querySelectorAll("span, div, p")].find(matches);
    return nested ? (nested.closest(OPTION_SELECTOR) ?? nested) : null;
  }

  // Returns true or false when the control reports its state, null when it doesn't.
  function isOptionSelected(option) {
    const input = option.matches("input") ? option : option.querySelector('input[type="checkbox"]');
    if (input) return input.checked;

    const stateful =
      [option, ...option.querySelectorAll("[aria-checked], [aria-selected], [aria-pressed], [data-state]")];
    for (const element of stateful) {
      for (const attribute of ["aria-checked", "aria-selected", "aria-pressed"]) {
        const value = element.getAttribute(attribute);
        if (value !== null) return value === "true";
      }
      const state = element.getAttribute("data-state");
      if (state === "checked" || state === "on") return true;
      if (state === "unchecked" || state === "off") return false;
    }
    return null;
  }

  async function ensureColumns(warnings) {
    const count = readColumnCount();
    if (count === TARGET_COUNT) return count;

    const editButton = findEditColumnsButton();
    if (!editButton) {
      warnings.push("Could not find the Edit Columns button. Scraped the columns currently shown.");
      return count;
    }

    // Clicking a column that is already on would turn it off, so the visible
    // headers decide what is missing, whatever the count says.
    const visible = new Set(readHeaders().map(normalize));
    const missing = REQUIRED_COLUMNS.filter((label) => !visible.has(normalize(label)));
    if (missing.length === 0) {
      warnings.push(`Column count is ${count ?? "unknown"}, expected ${TARGET_COUNT}, but all required columns are showing.`);
      return count;
    }

    press(editButton);
    const applyButton = await waitFor(() => findButton(/apply\s+selection/i));
    if (!applyButton) {
      warnings.push("The Edit Columns panel did not open. Scraped the columns currently shown.");
      return count;
    }

    const scope = applyButton.closest('[role="dialog"], [role="menu"]') ?? document.body;
    for (const label of missing) {
      const option = findColumnOption(scope, label);
      if (!option) {
        warnings.push(`Could not find the "${label}" option in Edit Columns.`);
        continue;
      }
      if (isOptionSelected(option) === true) continue;
      press(option);
      await sleep(50);
    }

    press(applyButton);
    await waitFor(() => !findButton(/apply\s+selection/i));

    // The table re-renders after Apply; give the new columns time to appear.
    const stillMissing = (headers) =>
      missing.filter((label) => !headers.has(normalize(label)));
    await waitFor(() => stillMissing(new Set(readHeaders().map(normalize))).length === 0);

    const absent = stillMissing(new Set(readHeaders().map(normalize)));
    if (absent.length > 0) warnings.push(`Columns missing after Apply: ${absent.join(", ")}.`);

    const finalCount = readColumnCount();
    if (finalCount && finalCount !== TARGET_COUNT) {
      warnings.push(`Column count is ${finalCount} after Apply, expected ${TARGET_COUNT}.`);
    }
    return finalCount;
  }

  // Keeps display text as-is unless the whole value is a number. Percent signs
  // are dropped: "85%" becomes 85. Dashes and blanks mean no data.
  function parseValue(raw) {
    const text = raw.trim();
    if (text === "" || /^[-–—]$/.test(text)) return null;
    const match = text.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*%?$/);
    return match ? Number(match[1].replace(/,/g, "")) : text;
  }

  function extractTeamStats() {
    const stats = {};
    for (const article of document.querySelectorAll("article[aria-label]")) {
      const label = article.getAttribute("aria-label").trim();
      if (!label) continue;
      const text = textOf(article);
      // Numbers are kept in page order; the stat label itself can contain digits,
      // so it is removed before they are read.
      const body = text.replace(label, " ");
      const values = (body.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) =>
        Number(value.replace(/,/g, "")),
      );
      stats[label] = { text, values };
    }
    return stats;
  }

  function findJersey(cells) {
    const key = Object.keys(cells).find((header) =>
      /^(jersey|shirt|number$|#$|no\.?$|player)/i.test(header.trim()),
    );
    const source = key === undefined ? null : cells[key];
    if (typeof source === "number") return Number.isInteger(source) ? source : null;
    const match = typeof source === "string" ? source.match(/\d{1,3}/) : null;
    return match ? Number(match[0]) : null;
  }

  function extractPlayerStats(warnings) {
    const table = findStatsTable();
    if (!table) return { headers: [], rows: [] };

    const headers = [...table.querySelectorAll('[role="columnheader"]')].map(textOf);
    const rows = [];
    let mismatched = 0;

    for (const row of table.querySelectorAll("tr")) {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length === 0) continue;
      if (tds.length !== headers.length) mismatched += 1;

      const cells = {};
      tds.forEach((td, index) => {
        cells[headers[index] ?? `column_${index + 1}`] = parseValue(textOf(td));
      });
      rows.push({ jersey: findJersey(cells), cells });
    }

    if (mismatched > 0) {
      warnings.push(`${mismatched} row(s) had a different cell count than the ${headers.length} headers. Check that columns lined up.`);
    }
    return { headers, rows };
  }

  async function scrape() {
    if (!isReportPage()) {
      return { ok: false, error: "This is not a Veo match report page." };
    }

    const warnings = [];
    const columnCount = await ensureColumns(warnings);
    const teamStats = extractTeamStats();
    const players = extractPlayerStats(warnings);

    if (players.rows.length === 0 && Object.keys(teamStats).length === 0) {
      return {
        ok: false,
        error: "No stats found. Wait for the report to finish loading, then try again.",
      };
    }
    if (players.rows.length === 0) warnings.push("No player rows found.");
    if (Object.keys(teamStats).length === 0) warnings.push("No team stats found.");

    return {
      ok: true,
      data: {
        schemaVersion: 1,
        source: "veo",
        veoUrl: location.href,
        scrapedAt: new Date().toISOString(),
        pageTitle: document.title,
        columnCount,
        teamStats,
        players,
        warnings,
      },
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "VEO_SCRAPE") return;
    scrape().then(sendResponse, (error) =>
      sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true; // Keeps the channel open for the async response.
  });
})();
