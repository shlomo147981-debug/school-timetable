'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { adminCreateClass, adminCreateUser, adminDeleteUser, adminUpdateUser } from '@/lib/api';
import type { Profile, Role } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/types';
import Modal from '../ui/Modal';

interface ClassRow { id: string; name: string; grade: number | null; homeroom_teacher_id: string | null }
interface Data { users: Profile[]; classes: ClassRow[]; links: { parent_id: string; student_id: string }[] }

const ROLES: Role[] = ['student', 'parent', 'teacher', 'homeroom'];

/** ניהול משתמשים — מנהל-על בלבד (נאכף ב-DB: admin_* בודקות is_admin) */
export default function AdminScreen({ me }: { me: Profile }) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Role | 'all'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const s = getSupabase();
    const [u, c, l] = await Promise.all([
      s.from('profiles').select('id, username, full_name, role, class_id, is_admin').order('full_name'),
      s.from('classes').select('id, name, grade, homeroom_teacher_id').order('name'),
      s.from('parent_children').select('parent_id, student_id'),
    ]);
    setData({ users: (u.data ?? []) as Profile[], classes: (c.data ?? []) as ClassRow[], links: l.data ?? [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const className = (id: string | null) => data?.classes.find((c) => c.id === id)?.name ?? '';
  const nameOf = (id: string) => data?.users.find((u) => u.id === id)?.full_name ?? '';

  const shown = useMemo(() => (data?.users ?? []).filter((u) =>
    (filter === 'all' || u.role === filter) &&
    (!q.trim() || u.full_name.includes(q.trim()) || u.username.includes(q.trim().toLowerCase()))), [data, filter, q]);

  const remove = async (u: Profile) => {
    if (!confirm(`למחוק את ${u.full_name} (${u.username})? הפעולה אינה הפיכה.`)) return;
    const r = await adminDeleteUser(u.id);
    if (r.ok) { notify('המשתמש נמחק'); load(); } else alert(r.error);
  };

  if (!me.is_admin) return <div className="card p-10 text-center text-slate-500">אין הרשאה</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">ניהול משתמשים</h1>
        <button className="btn-primary ms-auto" onClick={() => setEditing('new')}>➕ משתמש חדש</button>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(['all', ...ROLES] as const).map((r) => (
            <button key={r} onClick={() => setFilter(r)}
              className={`rounded-md px-3 py-1.5 ${filter === r ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
              {r === 'all' ? 'הכל' : ROLE_LABEL[r]}
              {data && <span className="ms-1 text-xs text-slate-400">{r === 'all' ? data.users.length : data.users.filter((u) => u.role === r).length}</span>}
            </button>
          ))}
        </div>
        <input className="input ms-auto w-48" placeholder="חיפוש שם / משתמש" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!data ? <div className="card p-10 text-center text-slate-400">טוען…</div> : (
        <div className="card divide-y divide-slate-100">
          {shown.map((u) => {
            const kids = data.links.filter((l) => l.parent_id === u.id).map((l) => nameOf(l.student_id));
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {u.full_name}
                    {u.is_admin && <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">מנהל</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    <span dir="ltr">{u.username}</span> · {ROLE_LABEL[u.role]}
                    {u.class_id && ` · כיתה ${className(u.class_id)}`}
                    {kids.length > 0 && ` · ילדים: ${kids.join(', ')}`}
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => setEditing(u)}>עריכה</button>
                {u.id !== me.id && <button className="btn-ghost text-red-700" onClick={() => remove(u)}>מחיקה</button>}
              </div>
            );
          })}
          {shown.length === 0 && <p className="p-6 text-center text-slate-400">אין משתמשים</p>}
        </div>
      )}

      {data && <ClassesCard classes={data.classes} nameOf={nameOf} onSaved={() => { load(); notify('הכיתה נוספה'); }} />}

      {editing && data && (
        <UserForm
          user={editing === 'new' ? null : editing}
          me={me}
          classes={data.classes}
          students={data.users.filter((u) => u.role === 'student')}
          children={editing === 'new' ? [] : data.links.filter((l) => l.parent_id === editing.id).map((l) => l.student_id)}
          className={className}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); load(); notify(m); }}
        />
      )}
      {toast && <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function ClassesCard({ classes, nameOf, onSaved }: { classes: ClassRow[]; nameOf: (id: string) => string; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState('');
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await adminCreateClass(name, grade ? Number(grade) : null);
    if (r.ok) { setName(''); setGrade(''); setError(''); onSaved(); } else setError(r.error);
  };
  return (
    <div className="card p-3">
      <h2 className="mb-2 font-semibold">כיתות</h2>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {classes.map((c) => (
          <span key={c.id} className="rounded-lg bg-slate-100 px-2 py-1">
            {c.name}{c.homeroom_teacher_id && <span className="text-slate-500"> · {nameOf(c.homeroom_teacher_id)}</span>}
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input className="input w-32" placeholder="שם (למשל ח2)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-24" type="number" placeholder="שכבה" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <button className="btn bg-slate-100" type="submit">➕ כיתה</button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </form>
    </div>
  );
}

function UserForm({
  user, me, classes, students, children, className, onClose, onSaved,
}: {
  user: Profile | null; me: Profile; classes: ClassRow[]; students: Profile[]; children: string[];
  className: (id: string | null) => string; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'student');
  const [classId, setClassId] = useState(user?.class_id ?? classes[0]?.id ?? '');
  const [kids, setKids] = useState<Set<string>>(new Set(children));
  const [isAdmin, setIsAdmin] = useState(user?.is_admin ?? false);
  const [kidFilter, setKidFilter] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const needsClass = role === 'student' || role === 'homeroom';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true); setError('');
    const payload = { full_name: fullName, password, role, class_id: needsClass ? classId || null : null, children: [...kids], is_admin: isAdmin };
    const r = user ? await adminUpdateUser(user.id, payload) : await adminCreateUser({ ...payload, username });
    setPending(false);
    if (r.ok) onSaved(user ? 'המשתמש עודכן' : `המשתמש ${username} נוצר`); else setError(r.error);
  };

  const toggleKid = (id: string) => setKids((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal title={user ? `עריכת ${user.full_name}` : 'משתמש חדש'} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <div>
          <label className="label" htmlFor="u-name">שם מלא</label>
          <input id="u-name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="u-user">שם משתמש</label>
            <input id="u-user" className="input" dir="ltr" required disabled={!!user} autoCapitalize="none" autoCorrect="off"
              pattern="[a-zA-Z0-9._\-]{3,32}" title="3-32 תווים: אותיות באנגלית, ספרות, . _ -"
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="u-pass">{user ? 'סיסמה חדשה (אופציונלי)' : 'סיסמה'}</label>
            <input id="u-pass" className="input" dir="ltr" type="text" required={!user} minLength={6} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <div>
          <span className="label">תפקיד</span>
          <div className="grid grid-cols-4 gap-1.5">
            {ROLES.map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`rounded-lg border px-2 py-2 text-sm ${role === r ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        {needsClass && (
          <div>
            <label className="label" htmlFor="u-class">{role === 'homeroom' ? 'מחנך/ת של כיתה' : 'כיתה'}</label>
            <select id="u-class" className="input" required value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">בחירת כיתה…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {role === 'parent' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">ילדים ({kids.size})</span>
              <input className="input w-36 py-1" placeholder="חיפוש…" value={kidFilter} onChange={(e) => setKidFilter(e.target.value)} />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {students.filter((s) => s.full_name.includes(kidFilter.trim())).map((s) => (
                <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${kids.has(s.id) ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={kids.has(s.id)} onChange={() => toggleKid(s.id)} />
                  {s.full_name} <span className="text-xs text-slate-400">{className(s.class_id)}</span>
                </label>
              ))}
              {students.length === 0 && <p className="p-2 text-center text-xs text-slate-400">אין תלמידים — צרו קודם תלמידים</p>}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAdmin} disabled={user?.id === me.id} onChange={(e) => setIsAdmin(e.target.checked)} />
          מנהל מערכת (גישה לניהול משתמשים ועריכת כל הכיתות)
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'שומר…' : user ? 'שמירה' : 'יצירת משתמש'}</button>
        </div>
      </form>
    </Modal>
  );
}
