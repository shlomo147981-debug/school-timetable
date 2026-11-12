'use client';

/**
 * ניווט פנימי ב-React State, מסונכרן ל-hash (#page=notes&view=day&date=…).
 * - אין טעינה מחדש ואין שימוש ב-router של Next — עובד זהה ב-GitHub Pages (/school-timetable/),
 *   בדפדפן ובתוך Capacitor.
 * - pushState/popstate: כפתור "חזור" (גם באנדרואיד) מחזיר למסך הקודם.
 * - מפתחות at/rt (העברת סשן ב-OTA) מסוננים ואינם חלק מהניווט.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type Patch = Record<string, string | null | undefined>;
interface Nav {
  params: URLSearchParams;
  /** עדכון פרמטרים (null = מחיקה). reset — מתחיל מאפס. replace — בלי רשומת היסטוריה */
  navigate: (patch: Patch, opts?: { reset?: boolean; replace?: boolean }) => void;
}

const HIDDEN = ['at', 'rt'];
const readHash = () => {
  const p = new URLSearchParams(typeof location === 'undefined' ? '' : location.hash.replace(/^#/, ''));
  HIDDEN.forEach((k) => p.delete(k));
  return p;
};

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useState<URLSearchParams>(() => readHash());
  const ref = useRef(params);
  ref.current = params;

  useEffect(() => {
    const sync = () => setParams(readHash());
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  const navigate = useCallback<Nav['navigate']>((patch, opts) => {
    const next = opts?.reset ? new URLSearchParams() : new URLSearchParams(ref.current.toString());
    for (const [k, v] of Object.entries(patch)) (v === null || v === undefined || v === '' ? next.delete(k) : next.set(k, v));
    if (next.toString() === ref.current.toString()) return;
    const hash = next.toString();
    const url = location.pathname + location.search + (hash ? `#${hash}` : '');
    try {
      if (opts?.replace) history.replaceState(history.state, '', url); else history.pushState(history.state, '', url);
    } catch { /* ignore */ }
    ref.current = next;
    setParams(next);
    if (!opts?.replace) window.scrollTo({ top: 0 });
  }, []);

  return <NavContext.Provider value={{ params, navigate }}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
}
