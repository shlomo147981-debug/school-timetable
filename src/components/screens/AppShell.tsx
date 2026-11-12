'use client';

import Link from 'next/link';
import { logout } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { ROLE_LABEL, isStaff } from '@/lib/types';

export type Page = 'schedule' | 'requests';

export default function AppShell({ profile, page, children }: { profile: Profile; page: Page; children: React.ReactNode }) {
  const tab = (p: Page) => `btn-ghost ${page === p ? 'bg-brand-50 text-brand-700' : ''}`;
  return (
    <div className="min-h-screen">
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-brand-700">📅 מערכת שעות</Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/" className={tab('schedule')}>מערכת</Link>
            <Link href="/?page=requests" className={tab('requests')}>{isStaff(profile.role) ? 'בקשות תלמידים' : 'הבקשות שלי'}</Link>
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <div className="text-end leading-tight">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</div>
            </div>
            <button className="btn-ghost" type="button" onClick={() => logout()}>יציאה</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
