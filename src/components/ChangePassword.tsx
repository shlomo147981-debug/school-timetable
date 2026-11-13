'use client';

import { useState } from 'react';
import { changeMyPassword, passwordWeakness } from '@/lib/api';

/** טופס שינוי סיסמה עצמי (בתוך תפריט ⚙️) */
export default function ChangePassword({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const weak = next ? passwordWeakness(next, username) : null;
  const mismatch = !!confirm && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) { setMsg({ ok: false, text: 'האימות אינו תואם לסיסמה החדשה' }); return; }
    setPending(true);
    const r = await changeMyPassword(current, next);
    setPending(false);
    if (r.ok) {
      setMsg({ ok: true, text: '✅ הסיסמה שונתה. מעכשיו התחברו עם הסיסמה החדשה.' });
      setCurrent(''); setNext(''); setConfirm('');
    } else setMsg({ ok: false, text: r.error });
  };

  if (!open) {
    return (
      <button type="button" className="btn w-full border border-slate-200 bg-white hover:bg-slate-50" onClick={() => setOpen(true)}>
        🔑 שינוי סיסמה
      </button>
    );
  }

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-3" aria-label="שינוי סיסמה">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🔑 שינוי סיסמה</h3>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> הצגת סיסמאות
        </label>
      </div>
      <div>
        <label className="label" htmlFor="pw-current">סיסמה נוכחית</label>
        <input id="pw-current" className="input" dir="ltr" type={type} autoComplete="current-password" required
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">סיסמה חדשה</label>
        <input id="pw-new" className="input" dir="ltr" type={type} autoComplete="new-password" required minLength={6}
          value={next} onChange={(e) => setNext(e.target.value)} />
        {weak && <p className="mt-1 text-xs text-amber-700">💡 {weak}</p>}
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">אימות סיסמה חדשה</label>
        <input id="pw-confirm" className="input" dir="ltr" type={type} autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch && <p className="mt-1 text-xs text-red-700">האימות אינו תואם</p>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={pending || mismatch || !current || next.length < 6}>
          {pending ? 'משנה…' : 'שמירת סיסמה חדשה'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>סגירה</button>
      </div>
    </form>
  );
}
