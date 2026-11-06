// Reads Veo pages: the team list, the recordings list, and match reports.
//
// Declared in the manifest for full page loads. Veo is a single-page app, so the
// background worker and popup also inject this file when needed. Each injection
// replaces the previous one, so there is only ever one listener.
//
// Selectors for match reports (article[aria-label], the player table's thead and
// tbody, the Player Stats tab, the Edit Columns panel) follow the report page. Selectors for team lists, recordings and
// key events are based on link shapes and visible text; if Veo's markup differs,
// these are the functions to adjust: discoverTeams, discoverGames, extractKeyEvents.
(() => {
  try {
    window.__veoScraperDispose?.();
  } catch {
    // The old context is already gone.
  }

  const TARGET_COUNT = "29/33";
  const REQUIRED_COLUMNS = [
    "Minutes tracked",
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
  // Veo's controls include Web Awesome elements such as <wa-button>.
  const BUTTON_SELECTOR = 'button, wa-button, [role="button"]';
  const OPTION_SELECTOR = `${BUTTON_SELECTOR}, label, wa-checkbox, wa-switch, wa-option, [role="checkbox"], [role="option"], [role="menuitemcheckbox"], [role="switch"]`;
  const REPORT_READY_TIMEOUT_MS = 30_000;
  const GAME_LINKS_TIMEOUT_MS = 15_000;
  const PLAYER_TABLE_TIMEOUT_MS = 10_000;
  const MAX_SCROLL_ROUNDS = 40;

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
    return [...document.querySelectorAll(BUTTON_SELECTOR)].find((button) =>
      pattern.test(textOf(button)),
    );
  }

  const humanize = (slug) =>
    decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  // ---- Team discovery ----------------------------------------------------------

  function discoverTeams() {
    const teams = new Map();

    for (const link of document.querySelectorAll('a[href*="/clubs/"]')) {
      const match = link.pathname.match(/^\/clubs\/([^/]+)\/teams\/([^/]+)(\/[^?#]*)?$/);
      if (!match) continue;
      const [, clubSlug, teamSlug, rest] = match;
      const id = `${clubSlug}/${teamSlug}`;
      const team = teams.get(id) ?? {
        id,
        clubSlug,
        name: humanize(teamSlug),
        recordingsUrl: `https://app.veo.co/clubs/${clubSlug}/teams/${teamSlug}/recordings/`,
      };
      // Only a link to the team itself is labeled with the team's name; its
      // sub-page links say things like "Recordings".
      if (!rest || rest === "/") {
        const label = (link.getAttribute("aria-label") || textOf(link)).trim();
        if (label) team.name = label.slice(0, 80);
      }
      if (/\/recordings/.test(rest ?? "")) team.recordingsUrl = link.href;
      teams.set(id, team);
    }

    const club = location.pathname.match(/^\/clubs\/([^/]+)/);
    // A club without separate teams keeps its recordings at the club level.
    if (teams.size === 0 && club) {
      const heading = document.querySelector("h1");
      teams.set(club[1], {
        id: club[1],
        clubSlug: club[1],
        name: (heading && textOf(heading)) || humanize(club[1]),
        recordingsUrl: `https://app.veo.co/clubs/${club[1]}/recordings/`,
      });
    }
    return { ok: true, onClubPage: Boolean(club), teams: [...teams.values()] };
  }

  // ---- Game discovery ----------------------------------------------------------

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MONTH_NAME = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";

  function isoDate(year, month, day) {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
    return date.toISOString().slice(0, 10);
  }

  function monthNumber(name) {
    return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
  }

  // All-numeric dates like 03/04/2025 are ignored on purpose: without knowing the
  // locale, the day and month can't be told apart. The wizard asks instead.
  function parseDateText(text) {
    let match = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (match) return isoDate(match[1], match[2], match[3]);

    match = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAME},?\\s+(20\\d{2})\\b`, "i"));
    if (match) return isoDate(match[3], monthNumber(match[2]), match[1]);

    match = text.match(new RegExp(`\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "i"));
    if (match) return isoDate(match[3], monthNumber(match[1]), match[2]);

    return null;
  }

  function readGameDate(card, slug) {
    const datetime = card.querySelector("time[datetime]")?.getAttribute("datetime");
    if (datetime) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(datetime)) return datetime;
      const parsed = new Date(datetime);
      if (!Number.isNaN(parsed.getTime())) {
        return isoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
      }
    }
    const fromText = parseDateText(textOf(card));
    if (fromText) return fromText;

    const fromSlug = slug.match(/^(20\d{2})(\d{2})(\d{2})(?:\D|$)/);
    return fromSlug ? isoDate(fromSlug[1], fromSlug[2], fromSlug[3]) : null;
  }

  function parseOpponent(title, teamName) {
    const match = title.match(/^(.+?)\s+(?:vs\.?|v\.?|versus)\s+(.+)$/i);
    if (!match) return null;
    const [home, away] = [match[1].trim(), match[2].trim()];
    const team = normalize(teamName ?? "");
    if (team && normalize(home).includes(team)) return away;
    if (team && normalize(away).includes(team)) return home;
    return null;
  }

  // true when a report is linked or mentioned, false when the card says there
  // isn't one, null when it says nothing either way.
  function readHasReport(card) {
    const text = normalize(textOf(card));
    if (/\b(no|without) (match )?report\b|report (is )?(not available|unavailable|disabled)|processing|uploading/.test(text)) {
      return false;
    }
    if (card.querySelector('a[href*="/report"]') || /match report/.test(text)) return true;
    return null;
  }

  function collectGameLinks() {
    const links = new Map();
    for (const link of document.querySelectorAll('a[href*="/matches/"]')) {
      const slug = link.pathname.match(/^\/matches\/([^/]+)/)?.[1];
      if (slug && !links.has(slug)) links.set(slug, link);
    }
    return links;
  }

  async function loadEveryGame() {
    let previousCount = -1;
    let stableRounds = 0;
    for (let round = 0; round < MAX_SCROLL_ROUNDS && stableRounds < 3; round += 1) {
      const links = [...collectGameLinks().values()];
      stableRounds = links.length === previousCount ? stableRounds + 1 : 0;
      previousCount = links.length;

      findButton(/^(load|show) more/i)?.click();
      links.at(-1)?.scrollIntoView({ block: "end" });
      await sleep(500);
    }
  }

  function readGameCard(link, slug, otherSlugsPresent, teamName) {
    const candidate =
      link.closest('article, li, tr, [role="listitem"], [role="row"]') ?? link.parentElement ?? link;
    // A container holding several matches isn't this game's card.
    const holdsOtherGames = [...candidate.querySelectorAll('a[href*="/matches/"]')].some(
      (other) => otherSlugsPresent.has(other.pathname.match(/^\/matches\/([^/]+)/)?.[1]) &&
        !other.pathname.startsWith(`/matches/${slug}`),
    );
    const card = holdsOtherGames ? link : candidate;

    const heading = card.querySelector('h1, h2, h3, h4, h5, [role="heading"]');
    const title =
      (heading && textOf(heading)) ||
      link.getAttribute("aria-label") ||
      link.getAttribute("title") ||
      textOf(link) ||
      humanize(slug);

    return {
      slug,
      title: title.trim().slice(0, 120),
      date: readGameDate(card, slug),
      opponent: parseOpponent(title.trim(), teamName),
      hasReport: readHasReport(card),
    };
  }

  async function discoverGames({ teamName }) {
    await waitFor(() => collectGameLinks().size > 0, GAME_LINKS_TIMEOUT_MS);
    await loadEveryGame();

    const links = collectGameLinks();
    const slugs = new Set(links.keys());
    const games = [...links].map(([slug, link]) => readGameCard(link, slug, slugs, teamName));
    return { ok: true, games, pageUrl: location.href };
  }

  // ---- Match reports -----------------------------------------------------------

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

  // Direct cells only: the first column of each row holds a stats popup, and
  // anything nested inside it must not count as a column.
  function headerCells(table) {
    const rows = table.tHead?.rows;
    return rows?.length ? [...rows[rows.length - 1].cells] : [];
  }

  function findStatsTable() {
    return (
      [...document.querySelectorAll("table")].find((table) =>
        headerCells(table).some((cell) => /^player\b/.test(normalize(textOf(cell)))),
      ) ?? null
    );
  }

  function readHeaders() {
    const table = findStatsTable();
    return table ? headerCells(table).map(textOf) : [];
  }

  async function openPlayerStats() {
    if (findStatsTable()) return;
    const tab = findButton(/^player stats\b/i);
    if (tab) press(tab);
    await waitFor(findStatsTable, PLAYER_TABLE_TIMEOUT_MS);
  }

  // A column's button starts with its name and may carry extra text after it.
  // Anything mentioning "position" is a different option and is skipped.
  // "Passes" also prefixes "Passes successful", so a button belonging to a longer
  // required column is never taken for a shorter one, and the shortest match wins.
  function findColumnOption(scope, label) {
    const wanted = normalize(label);
    const longerNames = REQUIRED_COLUMNS.map(normalize).filter(
      (name) => name !== wanted && name.startsWith(wanted),
    );
    const candidates = [...scope.querySelectorAll(OPTION_SELECTOR)].filter((element) => {
      if (element.closest("table")) return false;
      const text = normalize(element.textContent);
      return (
        text.startsWith(wanted) &&
        !text.includes("position") &&
        !longerNames.some((name) => text.startsWith(name))
      );
    });
    candidates.sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length);
    return candidates[0] ?? null;
  }

  // Returns true or false when the control reports its state, null when it doesn't.
  function isOptionSelected(option) {
    const input = option.matches("input") ? option : option.querySelector('input[type="checkbox"]');
    if (input) return input.checked;

    const stateful = [
      option,
      ...option.querySelectorAll("[aria-checked], [aria-selected], [aria-pressed], [data-state]"),
    ];
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

    // Without headers every column looks missing, and clicking them could turn
    // visible ones off.
    if (!findStatsTable()) return count;

    const editButton = findEditColumnsButton();
    if (!editButton) {
      warnings.push("Could not find the Edit Columns button. Imported the columns currently shown.");
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
    const applyButton = await waitFor(() => findButton(/^apply\b/i));
    if (!applyButton) {
      warnings.push("The Edit Columns panel did not open. Imported the columns currently shown.");
      return count;
    }

    const scope =
      applyButton.closest('wa-dialog, wa-drawer, wa-popover, wa-dropdown, [role="dialog"], [role="menu"]') ??
      document.body;
    for (const label of missing) {
      const option = findColumnOption(scope, label);
      if (!option) {
        warnings.push(`Could not find the "${label}" option in Edit Columns.`);
        continue;
      }
      if (isOptionSelected(option) === true) continue;
      option.click();
      await sleep(50);
    }

    applyButton.click();
    await waitFor(() => !findButton(/^apply\b/i));

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

  const isMinutesHeader = (header) => /^(minutes|mins?\b|time played|playing time)/i.test(header.trim());

  // Reads 40, "40min", "40 mins", "40'", "40:00", "1:02:30" or "1h 2m" as minutes.
  // Keep in step with toMinutes in src/lib/stats.ts.
  function parseMinutes(raw) {
    const text = raw.trim();
    const plain = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?|['’])?$/i);
    if (plain) return Number(plain[1]);
    const clock = text.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/);
    if (clock) return Number(clock[1] ?? 0) * 60 + Number(clock[2]) + Number(clock[3]) / 60;
    const hours = text.match(/^(\d+)\s*h(?:rs?|ours?)?(?:\s*(\d+)\s*m(?:ins?|inutes?)?)?$/i);
    return hours ? Number(hours[1]) * 60 + Number(hours[2] ?? 0) : null;
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

  // The player cell holds a button reading "Deanna Motley#12", or "3Jersey #3–" for
  // a player with no Veo profile, then a <wa-popover> of stats that must not be read.
  // The report's header reads like "REP U12/13 Girls 1-1 CVUSC1". Headings are tried
  // first, then any short text outside the stats table.
  const SCORE_PATTERN = /^(\D.*?)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+(\S.*)$/;

  function readScore() {
    const parse = (element) => {
      if (element.textContent.length > 120 || element.closest("table, wa-popover, article")) return null;
      if (element.querySelector("table, article")) return null;
      const match = textOf(element).replace(/\s+/g, " ").trim().match(SCORE_PATTERN);
      return match && match[0].length <= 90 ? match : null;
    };
    const find = (selector) => {
      for (const element of document.querySelectorAll(selector)) {
        const match = parse(element);
        if (match) return match;
      }
      return null;
    };
    const match = find('h1, h2, h3, h4, header, [role="heading"]') ?? find("body *");
    if (!match) return null;
    const [text, first, firstScore, secondScore, second] = match;
    return { text, teams: [first, second], values: [Number(firstScore), Number(secondScore)] };
  }

  // Each card should show a number for both teams.
  function statsHaveNumbers(stats) {
    const cards = Object.values(stats);
    return cards.length > 0 && cards.every(({ values }) => values.length >= 2);
  }

  const hasTeamNumbers = () => statsHaveNumbers(extractTeamStats());

  function readPlayerCell(cell) {
    const trigger = [...cell.querySelectorAll("button")].find((button) => !button.closest("wa-popover"));
    const text = (trigger?.textContent ?? "").replace(/\s+/g, " ").trim();

    const unidentified = text.match(/^\d*\s*Jersey\s*#(\d+)/i);
    if (unidentified) return { name: null, jersey: Number(unidentified[1]) };

    const named = text.match(/^(.+?)\s*#(\d+)\D*$/);
    return named
      ? { name: named[1], jersey: Number(named[2]) }
      : { name: text || null, jersey: null };
  }

  function extractPlayerStats(warnings) {
    const table = findStatsTable();
    if (!table) return { headers: [], rows: [] };

    const headers = readHeaders();
    const playerColumn = headers.findIndex((header) => /^player\b/.test(normalize(header)));
    const rows = [];
    let mismatched = 0;
    let unreadMinutes = 0;

    if (!headers.some(isMinutesHeader)) {
      warnings.push("This report has no minutes column, so per 60 stats won't work for this game.");
    }

    for (const row of [...table.tBodies].flatMap((body) => [...body.rows])) {
      const rowCells = [...row.cells];
      if (rowCells.length === 0) continue;
      if (rowCells.length !== headers.length) mismatched += 1;

      const player = readPlayerCell(rowCells[playerColumn]);
      const cells = {};
      rowCells.forEach((cell, index) => {
        const header = headers[index] ?? `column_${index + 1}`;
        const text = textOf(cell);
        if (index === playerColumn) {
          cells[header] = player.name;
        } else if (isMinutesHeader(header)) {
          const minutes = parseMinutes(text);
          if (minutes === null && parseValue(text) !== null) unreadMinutes += 1;
          cells[header] = minutes ?? parseValue(text);
        } else {
          cells[header] = parseValue(text);
        }
      });
      rows.push({ jersey: player.jersey, name: player.name, cells });
    }

    if (unreadMinutes > 0) {
      warnings.push(`${unreadMinutes} row(s) had minutes in a format that couldn't be read, so per 60 stats may be off for this game.`);
    }
    if (mismatched > 0) {
      warnings.push(`${mismatched} row(s) had a different cell count than the ${headers.length} headers. Check that columns lined up.`);
    }
    return { headers, rows };
  }

  function findKeyEventsContainer() {
    const labelled = document.querySelector(
      'section[aria-label*="key" i], [role="region"][aria-label*="key event" i], [role="list"][aria-label*="event" i]',
    );
    if (labelled) return labelled;

    const heading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], button, span, p')].find(
      (element) => /^key (events?|moments?)$/i.test(textOf(element)),
    );
    if (!heading) return null;

    // Walk up to the nearest ancestor that holds more than just the heading.
    let container = heading.parentElement;
    while (container && container !== document.body) {
      if (normalize(textOf(container)).length > normalize(textOf(heading)).length) return container;
      container = container.parentElement;
    }
    return null;
  }

  // Events read like "15' · MIS Shot Shot by Deanna Motley". The name is read
  // separately so it can't affect the event's type or jersey.
  function readKeyEvent(text) {
    const credit = text.match(/\bby\s+(.+?)\s*$/i);
    const creditedTo = credit?.[1].replace(/\s*#\d+$/, "") ?? null;
    const player = creditedTo && !/^\d*\s*jersey\b/i.test(creditedTo) ? creditedTo : null;
    const action = credit ? text.slice(0, credit.index) : text;

    const lower = action.toLowerCase();
    let type = null;
    if (/\bgoal\b/.test(lower) && !/\bgoal\s*kicks?\b/.test(lower)) type = "goal";
    else if (/\bshots?\b/.test(lower)) type = "shot";
    if (!type) return null;

    // "4'" gives "4", and stoppage time "45+2'" gives "45+2".
    const time =
      text.match(/\b(\d{1,3}:\d{2})\b/)?.[1] ??
      text.match(/\b(\d{1,3}(?:\+\d{1,2})?)['’]/)?.[1] ??
      null;
    const jersey = player ? undefined : text.match(/(?:#|\bno\.?\s*|\bnumber\s+)(\d{1,3})\b/i)?.[1];
    return {
      type,
      time,
      jersey: jersey === undefined ? null : Number(jersey),
      player,
      description: text.slice(0, 160),
    };
  }

  function extractKeyEvents(warnings) {
    const container = findKeyEventsContainer();
    if (!container) {
      warnings.push("Could not find key events, so unassigned goals and shots aren't listed for this game.");
      return [];
    }

    let items = [...container.querySelectorAll('li, [role="listitem"], article')];
    if (items.length === 0) {
      // Unmarked lists: the repeating children of the largest group inside.
      const groups = [container, ...container.querySelectorAll("div, ul, ol")];
      const largest = groups.reduce((best, group) =>
        group.children.length > best.children.length ? group : best,
      );
      items = [...largest.children];
    }
    return items.map((item) => readKeyEvent(textOf(item))).filter(Boolean);
  }

  async function scrape() {
    if (!isReportPage()) {
      return {
        ok: false,
        error: `Veo opened ${location.pathname} instead of a match report. Check that you're signed in to Veo.`,
      };
    }

    const ready = await waitFor(
      () =>
        findStatsTable() ||
        document.querySelector("article[aria-label]") ||
        findButton(/^player stats\b/i),
      REPORT_READY_TIMEOUT_MS,
    );
    if (!ready) {
      return {
        ok: false,
        error: "No match report loaded. Match Reports may not be enabled for this game.",
      };
    }
    // Team stats load separately from the rest of the page, and the cards can appear
    // before their numbers do.
    await waitFor(hasTeamNumbers, 10_000);

    const warnings = [];
    // Opening the Player Stats tab may remove what the current tab shows, so read
    // that first. Anything not found yet gets a second look afterwards.
    let teamStats = extractTeamStats();
    let score = readScore();
    let keyEvents = findKeyEventsContainer() ? extractKeyEvents(warnings) : null;

    await openPlayerStats();
    const columnCount = await ensureColumns(warnings);
    const players = extractPlayerStats(warnings);

    if (!statsHaveNumbers(teamStats)) teamStats = extractTeamStats();
    score ??= readScore();
    keyEvents ??= extractKeyEvents(warnings);

    if (players.rows.length === 0 && Object.keys(teamStats).length === 0) {
      return {
        ok: false,
        error: "No stats found on this match report.",
      };
    }
    if (players.rows.length === 0) warnings.push("No player rows found.");
    if (!statsHaveNumbers(teamStats)) {
      warnings.push("Team stats couldn't be read, so goals against, possession and other team numbers will be missing for this game.");
    }

    const slug = location.pathname.match(/^\/matches\/([^/]+)/)[1];
    return {
      ok: true,
      data: {
        schemaVersion: 2,
        source: "veo",
        slug,
        // Without query parameters, so a re-import finds the same game.
        veoUrl: `https://app.veo.co/matches/${slug}/report`,
        scrapedAt: new Date().toISOString(),
        pageTitle: document.title,
        columnCount,
        // Kept with the team stats, so saving needs no new database column.
        teamStats: score ? { ...teamStats, Score: score } : teamStats,
        players,
        keyEvents,
        warnings,
      },
    };
  }

  // ---- Messages ----------------------------------------------------------------

  const HANDLERS = {
    VEO_DISCOVER_TEAMS: async () => discoverTeams(),
    VEO_DISCOVER_GAMES: discoverGames,
    VEO_SCRAPE: scrape,
  };

  function onMessage(message, _sender, sendResponse) {
    const handler = HANDLERS[message?.type];
    if (!handler) return;
    handler(message).then(sendResponse, (error) =>
      sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true; // Keeps the channel open for the async response.
  }

  chrome.runtime.onMessage.addListener(onMessage);
  window.__veoScraperDispose = () => chrome.runtime.onMessage.removeListener(onMessage);

  // Content scripts run in an isolated world, so window.__veoScraperDispose can't
  // be seen from the page. The DOM is shared, so this attribute shows it loaded.
  const { version } = chrome.runtime.getManifest();
  document.documentElement.dataset.veoAnalyticsImporter = version;
  console.info(`[Veo Analytics Importer] content script ${version} loaded`);
})();
