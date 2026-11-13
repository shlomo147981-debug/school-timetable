'use client';

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_BUILD, APP_COMMIT, APP_VERSION, RELEASE_NOTES, buildDate, fetchRemoteVersion, goToRemote, isRemoteCopy, type RemoteVersion } from '@/lib/version';
import { getSupabase } from '@/lib/supabase/client';
import Modal from './ui/Modal';
import ChangePassword from './ChangePassword';

/** כפתור ⚙ בכותרת: מספר גרסה + "בדוק עדכוני גרסה" */
export default function VersionMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ remote: RemoteVersion | null } | null>(null);
  const remoteCopy = typeof window !== 'undefined' && isRemoteCopy();
  const native = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  const check = async () => {
    setChecking(true);
    const remote = await fetchRemoteVersion();
    setChecking(false);
    setResult({ remote });
  };

  const update = async (remote: RemoteVersion) => {
    if (remoteCopy) {
      // כבר בגרסה המקוונת — טעינה מחדש עוקפת מטמון
      const url = new URL(location.href);
      url.searchParams.set('v', String(remote.build));
      location.replace(url.toString());
      return;
    }
    const { data } = await getSupabase().auth.getSession();
    const s = data.session;
    try { localStorage.removeItem('school-timetable-auth'); sessionStorage.removeItem('ota-skip-session'); } catch { /* ignore */ }
    goToRemote(s ? { access_token: s.access_token, refresh_token: s.refresh_token } : null, remote.build);
  };

  const newer = result?.remote && result.remote.build > APP_BUILD ? result.remote : null;

  return (
    <>
      <button type="button" className="btn-ghost px-2" aria-label="הגדרות וגרסה" title="הגדרות: סיסמה, גרסה ועדכונים" onClick={() => { setOpen(true); setResult(null); }}>⚙️</button>
      {open && (
        <Modal title="הגדרות" onClose={() => setOpen(false)}>
          <div className="mb-4"><ChangePassword username={username} /></div>
          <h3 className="mb-2 font-semibold">גרסה ועדכונים</h3>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">גרסה</dt><dd className="font-medium">{APP_VERSION}</dd>
            <dt className="text-slate-500">נבנתה</dt><dd>{buildDate(APP_BUILD)} <span className="text-xs text-slate-400" dir="ltr">({APP_COMMIT})</span></dd>
            <dt className="text-slate-500">מקור</dt>
            <dd>{remoteCopy ? 'מקוון — GitHub Pages (מתעדכן אוטומטית)' : native ? 'מובנה ב-APK (גיבוי מקומי)' : 'דפדפן'}</dd>
          </dl>
          <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 font-semibold">מה חדש בגרסה {RELEASE_NOTES[0].version}</div>
            <ul className="list-disc space-y-0.5 ps-5 text-slate-600">
              {RELEASE_NOTES[0].notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
          <button type="button" className="btn-primary w-full" disabled={checking} onClick={check}>
            {checking ? 'בודק…' : '🔄 בדוק עדכוני גרסה'}
          </button>
          {result && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm" role="status">
              {!result.remote ? (
                <p>לא ניתן לבדוק כרגע (אין חיבור, או שהגרסה המקוונת עדיין לא פורסמה).</p>
              ) : newer ? (
                <div className="space-y-2">
                  <p>✨ קיימת גרסה חדשה: <b>{newer.version}</b> ({buildDate(newer.build)})</p>
                  <button type="button" className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => update(newer)}>עדכן עכשיו</button>
                </div>
              ) : (
                <p>✅ יש לך את הגרסה העדכנית ביותר.</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
