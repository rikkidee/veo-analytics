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
3. Open a report at `app.veo.co/matches/<match>/report`, click the extension, then **Scrape This Game**.
4. Click **Send to Veo Analytics** to open the import page, or **Copy JSON** to paste it there.

The extension sends data to `http://localhost:3000`. Change `APP_URL` in `chrome-extension/background.js` after deploying.
