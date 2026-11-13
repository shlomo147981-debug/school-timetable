'use client';

import { useEffect, useState } from 'react';
import { countNewNotes, logout } from '@/lib/api';
import { getNotesSeen } from '@/lib/notesSeen';
import { useNav } from '@/lib/nav';
import type { Profile } from '@/lib/types';
import { ROLE_LABEL, isStaff } from '@/lib/types';
import VersionMenu from '../VersionMenu';
import ConfirmDialog from '../ui/ConfirmDialog';

export type Page = 'schedule' | 'requests' | 'admin' | 'notes';

export default function AppShell({ profile, page, children }: { profile: Profile; page: Page; children: React.ReactNode }) {
  const [askLogout, setAskLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [newNotes, setNewNotes] = useState(0);
  const staff = isStaff(profile.role) || profile.is_admin;
  const { navigate } = useNav();
  const tab = (p: Page) => `btn-ghost ${page === p ? 'bg-brand-50 text-brand-700' : ''}`;
  const go = (p: Page) => navigate({ page: p === 'schedule' ? null : p });

  // תג "הערות חדשות" — הערות שמורים אחרים הזינו מאז הצפייה האחרונה
  useEffect(() => {
    if (!staff) return;
    const refresh = () => countNewNotes(getNotesSeen(profile.id), profile.id).then(setNewNotes).catch(() => {});
    refresh();
    window.addEventListener('notes-seen', refresh);
    return () => window.removeEventListener('notes-seen', refresh);
  }, [staff, profile.id, page]);

  return (
    <div className="min-h-screen">
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <button type="button" onClick={() => go('schedule')} className="text-lg font-bold text-brand-700">🔔 הצלצול</button>
          <nav className="flex flex-wrap gap-1 text-sm">
            <button type="button" onClick={() => go('schedule')} className={tab('schedule')} aria-current={page === 'schedule' ? 'page' : undefined}>מערכת</button>
            {staff && (
              <button type="button" onClick={() => go('notes')} className={tab('notes')} aria-current={page === 'notes' ? 'page' : undefined}>
                הערות
                {newNotes > 0 && <span className="ms-1 rounded-full bg-red-600 px-1.5 text-[11px] text-white">{newNotes}</span>}
              </button>
            )}
            <button type="button" onClick={() => go('requests')} className={tab('requests')} aria-current={page === 'requests' ? 'page' : undefined}>{staff ? 'בקשות תלמידים' : 'הבקשות שלי'}</button>
            {profile.is_admin && <button type="button" onClick={() => go('admin')} className={tab('admin')} aria-current={page === 'admin' ? 'page' : undefined}>ניהול משתמשים</button>}
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <div className="text-end leading-tight">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</div>
            </div>
            <VersionMenu />
            <button className="btn-ghost" type="button" onClick={() => setAskLogout(true)}>יציאה</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>

      {askLogout && (
        <ConfirmDialog
          title="יציאה מהאפליקציה"
          message="האם את.ה בטוחים שאתם רוצים לצאת מהאפליקציה?"
          confirmLabel="אישור"
          cancelLabel="ביטול"
          pending={leaving}
          onCancel={() => setAskLogout(false)}
          onConfirm={async () => { setLeaving(true); await logout(); }}
        />
      )}
    </div>
  );
}
