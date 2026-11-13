'use client';

import { useState } from 'react';
import { login } from '@/lib/api';
import { APP_VERSION, isRemoteCopy } from '@/lib/version';

export default function LoginScreen({ initialError }: { initialError?: string }) {
  const [error, setError] = useState(initialError ?? '');
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError('');
    const r = await login(String(fd.get('username') ?? ''), String(fd.get('password') ?? ''));
    setPending(false);
    if (!r.ok) setError(r.error);
    // בהצלחה — AuthProvider מזהה SIGNED_IN וטוען את המערכת
  };

  return (
    <main className="safe-top flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl text-white">🔔</div>
          <h1 className="text-xl font-bold">הצלצול</h1>
          <p className="text-sm text-slate-500">מערכת שעות בית-ספרית</p>
          <p className="mt-1 text-sm text-slate-500">התחברו עם מזהה המשתמש והסיסמה שקיבלתם מבית הספר</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="label">מזהה משתמש</label>
            <input id="username" name="username" className="input" dir="ltr" autoComplete="username"
              autoCapitalize="none" autoCorrect="off" required />
          </div>
          <div>
            <label htmlFor="password" className="label">סיסמה</label>
            <input id="password" name="password" type="password" className="input" dir="ltr" autoComplete="current-password" required />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? 'מתחבר…' : 'כניסה'}</button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400" suppressHydrationWarning>
          גרסה {APP_VERSION}{typeof window !== 'undefined' && isRemoteCopy() ? ' · מקוונת' : ''}
        </p>
      </div>
    </main>
  );
}
