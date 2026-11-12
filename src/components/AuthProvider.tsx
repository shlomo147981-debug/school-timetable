'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchMyProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';

type AuthState =
  | { status: 'loading'; profile: null }
  | { status: 'signed_out'; profile: null; error?: string }
  | { status: 'signed_in'; profile: Profile };

const AuthContext = createContext<{ auth: AuthState; reload: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', profile: null });

  const reload = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) { setAuth({ status: 'signed_out', profile: null }); return; }
    const profile = await fetchMyProfile(user.id);
    if (!profile) {
      await supabase.auth.signOut();
      setAuth({ status: 'signed_out', profile: null, error: 'למשתמש זה לא הוגדר פרופיל במערכת' });
      return;
    }
    setAuth({ status: 'signed_in', profile });
  }, []);

  useEffect(() => {
    reload();
    // אירועי התחברות/יציאה/תפוגת טוקן. setTimeout — כדי לא לקרוא ל-Supabase מתוך ה-callback עצמו.
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(reload, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);

  return <AuthContext.Provider value={{ auth, reload }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
