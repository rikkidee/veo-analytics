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

1. Go to `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose the `chrome-extension/` folder.
3. In the app, open **Import Games** at `/onboarding/games` and follow the wizard.

The wizard works from `http://localhost:3000` and `https://veo-analytics.vercel.app`. To allow another address, add it to `APP_URLS` in `chrome-extension/background.js` and to both address lists in `chrome-extension/manifest.json`.
