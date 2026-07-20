import { supabase } from './supabase';

// Auth now runs against Supabase Auth (server-side identity), which is what
// makes cross-device sync and sharing possible — RLS policies key off the
// authenticated user's id. The local email/password + SQLite session that
// lived here previously has been removed.
//
// Supabase persists the session in AsyncStorage, so once you've signed in the
// app stays logged in across restarts and can read cached data offline; only
// the initial sign-in and token refresh need a network connection.

// Normalizes a Supabase user object into the small shape the app's screens
// expect ({ id, email, name }). `name` is stored in user_metadata at sign-up.
export function mapUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name ?? null,
  };
}

export async function signUp({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name?.trim() || null } },
  });
  if (error) throw error;
  return mapUser(data.user);
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return mapUser(data.user);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
