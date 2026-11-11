# Veo Analytics

A multi-team soccer stats dashboard built from Veo match reports.

## Setup

1. Run `supabase/schema.sql` in your Supabase project's SQL editor.
2. Copy `.env.example` to `.env.local` and fill in your project URL and anon key.
3. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

## Chrome extension

Coaches install [Veo Analytics Importer from the Chrome Web Store](https://chromewebstore.google.com/detail/veo-analytics-importer/eppgfdgbdljgncemcggbmgpfpffgkbfo), then click **Import Games** in the app's top bar and follow the steps.

To work on the extension itself, go to `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose the `chrome-extension/` folder.

The import works from `http://localhost:3000` and `https://veo-analytics.vercel.app`. To allow another address, add it to `APP_URLS` in `chrome-extension/background.js` and to both address lists in `chrome-extension/manifest.json`.

## Chrome Web Store

Listing copy, the promo tile and the upload zip are in `store-listing/`. The privacy policy is `public/privacy-policy.html`.

After changing the extension, bump `version` in `chrome-extension/manifest.json` and rebuild the zip:

```bash
npm run extension:package
```

The zip leaves out `localhost`, so test against `chrome-extension/` during development. `npm run extension:assets` regenerates the icons and promo tile.
