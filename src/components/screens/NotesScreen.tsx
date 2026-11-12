'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchClassNotes, type ClassNote } from '@/lib/api';
import { addDays, heDate, todayISO } from '@/lib/dates';
import { getNotesSeen, setNotesSeen } from '@/lib/notesSeen';
import type { ExceptionType, Profile } from '@/lib/types';
import { EXCEPTION_LABEL, EXCEPTION_STATUS_LABEL, type ExceptionStatus } from '@/lib/types';

const TYPE_STYLE: Record<ExceptionType, string> = {
  praise: 'bg-emerald-100 text-emerald-800',
  absence: 'bg-red-100 text-red-800',
  late: 'bg-amber-100 text-amber-800',
  missing_equipment: 'bg-orange-100 text-orange-800',
  misbehavior: 'bg-rose-100 text-rose-800',
};
const RANGES = [{ days: 7, label: 'שבוע' }, { days: 30, label: 'חודש' }, { days: 120, label: '4 חודשים' }];

/**
 * הערות ודיווחים בכיתה — מבט-על למחנך/מנהל: מי המורה שכתב, מקצוע, תאריך ותוכן.
 * הערות שנוספו מאז הצפייה האחרונה מסומנות "חדש".
 */
export default function NotesScreen({ me }: { me: Profile }) {
  const [classes, setClasses] = useState<{ id: string; name: string; homeroom_teacher_id: string | null }[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [days, setDays] = useState(30);
  const [notes, setNotes] = useState<ClassNote[] | null>(null);
  const [type, setType] = useState<ExceptionType | 'all'>('all');
  const [teacher, setTeacher] = useState('all');
  const [student, setStudent] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [seen, setSeen] = useState(() => getNotesSeen(me.id));

  useEffect(() => {
    getSupabase().from('classes').select('id, name, homeroom_teacher_id').order('name').then(({ data }) => {
      const list = data ?? [];
      setClasses(list);
      setClassId((list.find((c) => c.homeroom_teacher_id === me.id) ?? list.find((c) => c.id === me.class_id) ?? list[0])?.id ?? '');
    });
  }, [me.id, me.class_id]);

  const load = useCallback(async () => {
    if (!classId) return;
    setNotes(null);
    setNotes(await fetchClassNotes(classId, addDays(todayISO(), -days)));
  }, [classId, days]);
  useEffect(() => { load(); }, [load]);

  const isNew = (n: ClassNote) => n.created_at > seen && n.reporter_id !== me.id;
  const teachers = useMemo(() => [...new Set((notes ?? []).map((n) => n.reporter?.full_name ?? '—'))].sort(), [notes]);
  const shown = (notes ?? []).filter((n) =>
    (type === 'all' || n.type === type) &&
    (teacher === 'all' || (n.reporter?.full_name ?? '—') === teacher) &&
    (!student.trim() || n.student?.full_name.includes(student.trim())) &&
    (!onlyNew || isNew(n)));
  const newCount = (notes ?? []).filter(isNew).length;
  const counts = (Object.keys(EXCEPTION_LABEL) as ExceptionType[]).map((t) => ({ t, n: (notes ?? []).filter((x) => x.type === t && !x.retracted).length }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">הערות ודיווחים בכיתה</h1>
        {newCount > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">{newCount} חדשות</span>}
        <button className="btn-ghost ms-auto text-sm" onClick={() => { const now = new Date().toISOString(); setNotesSeen(me.id, now); setSeen(now); setOnlyNew(false); }} disabled={!newCount}>✓ סמן הכל כנקרא</button>
      </div>

      <div className="card space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {classes.length > 1 && (
            <select className="input w-auto" aria-label="כיתה" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>כיתה {c.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)}
                className={`rounded-md px-3 py-1 ${days === r.days ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>{r.label}</button>
            ))}
          </div>
          <select className="input w-auto" aria-label="מורה" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="all">כל המורים</option>
            {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input w-40" placeholder="חיפוש תלמיד" value={student} onChange={(e) => setStudent(e.target.value)} />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> רק חדשות
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setType('all')} className={`rounded-full px-3 py-1 text-xs ${type === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>הכל</button>
          {counts.map(({ t, n }) => (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-full px-3 py-1 text-xs ${type === t ? 'ring-2 ring-slate-800' : ''} ${TYPE_STYLE[t]}`}>
              {EXCEPTION_LABEL[t]} · {n}
            </button>
          ))}
        </div>
      </div>

      {notes === null ? <div className="card p-10 text-center text-slate-400">טוען…</div>
        : shown.length === 0 ? <div className="card p-10 text-center text-slate-500">אין הערות בטווח שנבחר</div>
        : (
          <div className="card divide-y divide-slate-100">
            {shown.map((n) => (
              <article key={n.id} className={`flex gap-3 p-3 ${isNew(n) ? 'bg-brand-50/60' : ''} ${n.retracted ? 'opacity-50' : ''}`}>
                <span className={`h-fit shrink-0 rounded px-2 py-0.5 text-xs ${TYPE_STYLE[n.type]}`}>{EXCEPTION_LABEL[n.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <b>{n.student?.full_name}</b>
                    <span className="text-slate-500">· {n.lesson?.subject} · {heDate(n.lesson_date, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
                    {isNew(n) && <span className="rounded bg-brand-600 px-1.5 text-[11px] text-white">חדש</span>}
                    {n.retracted && <span className="text-xs text-slate-500">(בוטלה בערעור)</span>}
                  </div>
                  {n.note && <p className="mt-0.5 text-sm">{n.note}</p>}
                  <div className="mt-0.5 text-xs text-slate-500">
                    נרשם ע״י <b>{n.reporter?.full_name ?? 'משתמש שנמחק'}</b>
                    {' · '}{new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.created_at))}
                    {n.status && ` · ${EXCEPTION_STATUS_LABEL[n.status as ExceptionStatus]}`}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
