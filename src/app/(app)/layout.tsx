import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { ROLE_LABEL, isStaff } from '@/lib/types';
import { logout } from '../actions/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <div className="min-h-screen">
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/schedule" className="text-lg font-bold text-brand-700">📅 מערכת שעות</Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/schedule" className="btn-ghost">מערכת</Link>
            <Link href="/requests" className="btn-ghost">{isStaff(profile.role) ? 'בקשות תלמידים' : 'הבקשות שלי'}</Link>
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <div className="text-end leading-tight">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</div>
            </div>
            <form action={logout}>
              <button className="btn-ghost" type="submit">יציאה</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
