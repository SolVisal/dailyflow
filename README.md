# DailyFlow Finance
1. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
2. `cp .env.example .env` and fill in your URL + anon key.
3. `npm install && npm run dev`
Architecture: `src/lib.js` = client + pure finance logic; `src/App.jsx` = pages. Split pages into files as it grows.
