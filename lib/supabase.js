import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Credentials come from environment variables (Expo inlines any variable
// prefixed with EXPO_PUBLIC_ at build time). Copy .env.example to .env, fill in
// your project's values, then restart with `npx expo start -c`.
//
// The anon key is safe to ship in a client bundle — it only grants access that
// your Row-Level Security policies explicitly allow. Never put the service_role
// key here.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Fall back to harmless placeholders when unconfigured so the app still boots
// to the auth screen (which shows a "configure Supabase" hint) instead of
// white-screening at import time.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // No deep-link URL to parse on React Native.
      detectSessionInUrl: false,
    },
  }
);
