import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { mapUser, signIn, signUp, signOut } from './auth';
import { syncNow } from './sync';

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

  // Sync on login and whenever the app returns to the foreground. Individual
  // screens also trigger a sync on focus and after mutations.
  useEffect(() => {
    if (!user) return;
    syncNow(user.id);

    const onAppStateChange = (state) => {
      if (state === 'active' && userRef.current) syncNow(userRef.current.id);
    };
    const appSub = AppState.addEventListener('change', onAppStateChange);
    return () => appSub.remove();
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
