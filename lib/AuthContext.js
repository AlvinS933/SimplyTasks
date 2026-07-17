import React, { createContext, useContext, useEffect, useState } from 'react';
import * as auth from './auth';

// Holds the currently-logged-in user for the whole app. Screens read `user`
// and call signIn/signUp/signOut; the auth gate in App.js switches navigators
// based on whether `user` is null. When Supabase arrives, only this file's
// internals change (swap auth.* for supabase.auth.*) — screens stay the same.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth
      .getCurrentUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    signIn: async (credentials) => {
      const u = await auth.signIn(credentials);
      setUser(u);
      return u;
    },
    signUp: async (credentials) => {
      const u = await auth.signUp(credentials);
      setUser(u);
      return u;
    },
    signOut: async () => {
      await auth.signOut();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
