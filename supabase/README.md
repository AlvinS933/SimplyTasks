# Supabase setup (one-time, free tier)

Do these steps once to turn on cloud sync. Everything here fits the free tier.

## 1. Create a project
1. Go to https://supabase.com and create a free account + a new project.
2. Pick a region near you and a database password (you won't need the password in the app).
3. Wait ~2 minutes for it to provision.

## 2. Create the schema
1. In the dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
3. It should complete with no errors. (It's safe to re-run if you tweak it.)

## 3. Auth settings (for easy testing)
1. **Authentication → Providers → Email**: make sure Email is enabled.
2. **Authentication → Providers → Email → "Confirm email"**: turn this **OFF** while
   developing, so new sign-ups work without a mail server. (Turn it back on for production.)

## 4. Point the app at your project
1. In the dashboard: **Settings → API**. Copy the **Project URL** and the **anon public** key.
2. In the repo root, copy `.env.example` to `.env`:
   ```
   cp .env.example .env      # (Windows PowerShell: Copy-Item .env.example .env)
   ```
3. Paste your values into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhb....
   ```
4. Restart Metro with a cleared cache so the new env vars are picked up:
   ```
   npx expo start -c
   ```

## 5. Try it
- Sign up two different accounts (on one device is fine, or two devices).
- Create a list, add tasks — they sync up automatically.
- Open a list → **Share**, enter the other account's email → that account now sees the list.
- Toggle a task on one device; it appears on the other after a sync (on focus / foreground).

## Notes
- **The anon key is safe in the client** — Row-Level Security is what protects data.
  Never put the `service_role` key in the app.
- **Free-tier projects pause after ~1 week of inactivity.** If sync stops, open the
  Supabase dashboard once to resume the project.
- Switching to Supabase Auth changed how user identity works, so any tasks created
  under the old local-only accounts won't carry over. Use the in-app dev "Reset
  database" action (or reinstall) for a clean slate.
