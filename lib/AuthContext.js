import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { mapUser, signIn, signUp, signOut } from './auth';
import { syncNow } from './sync';
import { clearAllData } from '../db/database';

// AsyncStorage key remembering which user the local SQLite cache belongs to.
const CACHE_OWNER_KEY = 'simplytasks.cacheOwner';

// Holds the currently-logged-in user for the whole app. The value comes from
// Supabase's auth session (persisted in AsyncStorage), so this survives app
// restarts and reflects sign-in/out from anywhere. The auth gate in App.js
// switches navigators based on whether `user` is null.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Kept in a ref so the AppState listener always syncs the current user
  // without needing to re-subscribe on every user change.
  const userRef = useRef(null);
  userRef.current = user;

  // Load the persisted session, then keep in step with auth state changes
  // (sign-in, sign-out, token refresh).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(mapUser(data.session?.user));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // On login: keep the local cache tied to ONE account. If a different user
  // signs in on this device, wipe the previous user's cached data first.
  // Otherwise both users' rows share one SQLite file, and pushing another
  // user's rows fails RLS (you can only write rows you own), which poisons the
  // whole sync. Same user signing back in keeps their offline data intact.
  // Then sync, and re-sync whenever the app returns to the foreground.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const cacheOwner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
        if (cacheOwner && cacheOwner !== user.id) {
          await clearAllData();
        }
        await AsyncStorage.setItem(CACHE_OWNER_KEY, user.id);
      } catch (e) {
        if (__DEV__) console.log('[auth] cache-owner check failed:', e.message);
      }
      if (!cancelled) syncNow(user.id);
    })();

    const onAppStateChange = (state) => {
      if (state === 'active' && userRef.current) syncNow(userRef.current.id);
    };
    const appSub = AppState.addEventListener('change', onAppStateChange);
    return () => {
      cancelled = true;
      appSub.remove();
    };
  }, [user?.id]);

  // Realtime: subscribe to Postgres changes on the synced tables so a change
  // made by ANYONE on a shared list arrives immediately. Each event just kicks
  // off a sync (pull), which then notifies focused screens to re-render. RLS
  // scopes the change feed to rows this user can see. Requires the tables to be
  // added to the `supabase_realtime` publication (see supabase/schema.sql).
  useEffect(() => {
    if (!user) return;
    const onChange = () => syncNow(user.id);
    const channel = supabase
      .channel(`sync:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const value = {
    user,
    loading,
    signIn: async (credentials) => {
      const u = await signIn(credentials);
      setUser(u);
      return u;
    },
    signUp: async (credentials) => {
      const u = await signUp(credentials);
      setUser(u);
      return u;
    },
    signOut: async () => {
      await signOut();
      setUser(null);
    },
    // Bound to the current user; a no-op when logged out. Screens call this on
    // focus / after mutations to push local changes and pull remote ones.
    syncNow: () => (userRef.current ? syncNow(userRef.current.id) : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
