'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchMyProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';

type AuthState =
  | { status: 'loading'; profile: null }
  | { status: 'signed_out'; profile: null; error?: string }
  | { status: 'signed_in'; profile: Profile };

/** סשן שהועבר מהגרסה המובנית (OTA) דרך ה-hash — נקלט פעם אחת ונמחק מה-URL */
async function adoptHandedOverSession() {
  if (typeof location === 'undefined' || !location.hash.includes('rt=')) return;
  const h = new URLSearchParams(location.hash.slice(1));
  const access_token = h.get('at'), refresh_token = h.get('rt');
  h.delete('at'); h.delete('rt');   // משאירים את מצב הניווט, מוחקים רק את הטוקנים
  history.replaceState(history.state, '', location.pathname + location.search + (h.toString() ? `#${h}` : ''));
  if (access_token && refresh_token) {
    try { await getSupabase().auth.setSession({ access_token, refresh_token }); } catch { /* ignore */ }
  }
}

const AuthContext = createContext<{ auth: AuthState; reload: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', profile: null });

  const reload = useCallback(async () => {
    const supabase = getSupabase();
    await adoptHandedOverSession();
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
