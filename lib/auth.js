import * as Crypto from 'expo-crypto';
import {
  makeId,
  insertUser,
  getUserByEmail,
  getUserById,
  setSession,
  getSessionUserId,
  clearSession,
} from '../db/database';

// Demo-grade password hashing: SHA-256 over (salt + password), with a random
// per-user salt. This is deliberately simple and LOCAL ONLY. When Supabase
// Auth lands it replaces this entirely — real auth never stores/derives
// passwords on the client. Do not treat this as production-secure.
async function hashPassword(password, salt) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    salt + password
  );
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export async function signUp({ email, password, name }) {
  email = normalizeEmail(email);
  if (!email || !password) throw new Error('Email and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  const existing = await getUserByEmail(email);
  if (existing) throw new Error('An account with that email already exists.');

  const id = makeId();
  const salt = makeId();
  const passwordHash = await hashPassword(password, salt);

  await insertUser({ id, email, name: name?.trim() || null, passwordHash, salt });
  await setSession(id);
  return getUserById(id);
}

export async function signIn({ email, password }) {
  email = normalizeEmail(email);
  const user = await getUserByEmail(email);
  if (!user) throw new Error('No account found for that email.');

  const attempt = await hashPassword(password, user.salt);
  if (attempt !== user.password_hash) throw new Error('Incorrect password.');

  await setSession(user.id);
  return user;
}

export async function signOut() {
  await clearSession();
}

// Restores the logged-in user on app launch, or null if nobody is logged in.
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return getUserById(userId);
}
