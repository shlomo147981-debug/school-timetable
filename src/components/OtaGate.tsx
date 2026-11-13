'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_BUILD, fetchRemoteVersion, goToRemote, isRemoteCopy } from '@/lib/version';
import { getSupabase } from '@/lib/supabase/client';

const SKIP_KEY = 'ota-skip-session';

/**
 * עדכון אוטומטי (OTA) באפליקציית האנדרואיד:
 * ה-APK מכיל גרסה מובנית מלאה. בפתיחה בודקים ב-GitHub Pages אם יש גרסה חדשה יותר —
 * אם כן עוברים אליה (עם הסשן). אין רשת / אין Pages → ממשיכים בגרסה המובנית (גיבוי מקומי).
 */
export default function OtaGate({ children }: { children: React.ReactNode }) {
  const native = typeof window !== 'undefined' && Capacitor.isNativePlatform() && !isRemoteCopy();
  const [state, setState] = useState<'checking' | 'updating' | 'ready'>(native ? 'checking' : 'ready');
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (!native) return;
    let skip = false;
    try {
      if (new URLSearchParams(location.search).get('offline') === '1') sessionStorage.setItem(SKIP_KEY, '1');
      skip = sessionStorage.getItem(SKIP_KEY) === '1';
    } catch { /* ignore */ }
    if (skip) { setState('ready'); return; }

    (async () => {
      const remote = await fetchRemoteVersion(4000);
      if (!remote || remote.build <= APP_BUILD) { setState('ready'); return; }
      setTarget(remote.version);
      setState('updating');
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      // מסירים את הסשן המקומי בלי לבטל אותו בשרת — הוא ממשיך בגרסה המקוונת
      try { localStorage.removeItem('school-timetable-auth'); } catch { /* ignore */ }
      goToRemote(s ? { access_token: s.access_token, refresh_token: s.refresh_token } : null, remote.build);
    })();
  }, [native]);

  if (state === 'ready') return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">🔔</div>
      {state === 'updating' && <p className="text-sm">מעדכן לגרסה {target}…</p>}
    </div>
  );
}
