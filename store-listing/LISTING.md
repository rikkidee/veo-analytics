# Chrome Web Store listing

Copy these into the Developer Dashboard. Upload `veo-analytics-extension-1.0.0.zip`.

## Store listing tab

**Name** (from the manifest): Veo Analytics Importer

**Short description** (from the manifest `description`, 110 of 132 characters):

> Import your Veo match report stats into your Veo Analytics account. Independent tool, not affiliated with Veo.

**Category:** Sports. If the dashboard doesn't offer Sports, choose the closest match.

**Language:** English

**Store icon:** included in the zip at `icons/icon-128.png`. Upload it separately if the dashboard asks.

**Small promo tile (440x280):** `promo-small-440x280.png`

**Screenshots (at least one is required, 1280x800):** not created yet. Capture the wizard and dashboard from the running app.

**Detailed description:**

> Veo Analytics Importer brings the stats from your Veo match reports into Veo Analytics, so you can follow your team and players across a whole season.
>
> Without it, getting numbers out of match reports means opening each game and copying them by hand. The importer does that for you, for as many games as you choose.
>
> HOW IT WORKS
> 1. Install the extension and open the import wizard in Veo Analytics.
> 2. Sign in to Veo and open your club page. The wizard finds your teams.
> 3. Pick the games to import. Games without a match report are greyed out.
> 4. The extension reads each report, showing progress as it goes.
> 5. Match any jerseys that don't fit your roster, and assign goals and shots that have no player. Then save.
>
> WHAT YOU GET
> • Team totals and game-by-game charts
> • Player profiles with radar charts
> • Leaderboards by total, per game and per 60 minutes
> • Control over every game before it is saved
>
> WHAT YOU NEED
> • A Veo account with Match Reports enabled
> • A Veo Analytics account at veo-analytics.vercel.app
>
> YOUR DATA
> The extension only reads Veo when you use it, and it passes what it reads to the Veo Analytics page open in your browser. It never collects your passwords or browsing history, and it contains no ads or trackers. Full details are in the privacy policy.
>
> Veo Analytics is an independent tool. It is not affiliated with or endorsed by Veo.

## Privacy tab

**Single purpose:**

> Import match report statistics from a user's Veo account into their Veo Analytics account.

**Permission justifications:**

- **scripting:** Veo is a single-page app, so a page reached by clicking within the site may not have the extension's reader loaded. The extension uses this permission to load its own packaged script into Veo and Veo Analytics tabs. It runs no remote code.
- **Host permission `https://app.veo.co/*`:** Needed to open and read the user's club pages, recordings and match reports when they run an import.
- **Host permission `https://veo-analytics.vercel.app/*`:** Needed to connect the extension to the import wizard in the Veo Analytics web app, and pass it the data that was read.

**Remote code:** No, I am not using remote code.

**Data usage disclosures** (tick these; they must match the privacy policy):

- **Personally identifiable information:** yes. Match reports can include player names, and the web app stores the account email.
- **Website content:** yes. Match report text and statistics.
- **Everything else** (health, financial, authentication, location, web history, user activity, personal communications): no.

Then tick all three certifications: no selling data, no unrelated uses, no creditworthiness or lending uses.

**Privacy policy URL:** https://veo-analytics.vercel.app/privacy-policy.html

## Reviewer test instructions

Reviewers can't exercise the extension without accounts. If the dashboard has a test instructions field, give them a Veo Analytics test login and a Veo account with Match Reports enabled, and these steps:

> 1. Install the extension and sign in at https://veo-analytics.vercel.app/auth.
> 2. Open Import Games and click Check Connection.
> 3. In another tab, sign in at https://app.veo.co and open the club page.
> 4. Follow the wizard to import a game, map its jerseys and save it, then open the Dashboard.
