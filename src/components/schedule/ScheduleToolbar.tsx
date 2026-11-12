'use client';

import { useNav } from '@/lib/nav';
import { navigate, todayISO, toSchoolDay } from '@/lib/dates';
import type { ClassRow, Person, Role, View } from '@/lib/types';
import { isStaff } from '@/lib/types';
import type { Scope } from '@/lib/context';

const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'יומי' },
  { id: 'week', label: 'שבועי' },
  { id: 'month', label: 'חודשי' },
];

export default function ScheduleToolbar(props: {
  role: Role; view: View; date: string; title: string;
  classId: string | null; className: string; studentId: string | null; scope: Scope;
  classes: ClassRow[]; students: Person[]; kids: Person[];
}) {
  const nav = useNav();
  const go = (patch: Record<string, string | null>) => nav.navigate(patch);

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
      {/* בורר תצוגה עליון */}
      <div role="tablist" aria-label="בחירת תצוגה" className="flex rounded-lg bg-slate-100 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={props.view === v.id}
            onClick={() => go({ view: v.id })}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              props.view === v.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ניווט בזמן — ב-RTL "הקודם" מימין */}
      <div className="flex items-center gap-1">
        <button className="btn-ghost" aria-label="הקודם" onClick={() => go({ date: navigate(props.view, props.date, -1) })}>→</button>
        <button className="btn-ghost" onClick={() => go({ date: toSchoolDay(todayISO()) })}>היום</button>
        <button className="btn-ghost" aria-label="הבא" onClick={() => go({ date: navigate(props.view, props.date, 1) })}>←</button>
        <h2 className="ms-2 text-base font-semibold">{props.title}</h2>
      </div>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        {/* הורה: מעבר בין אחים */}
        {props.role === 'parent' && props.kids.length > 1 && (
          <div className="flex rounded-lg bg-slate-100 p-1">
            {props.kids.map((k) => (
              <button
                key={k.id}
                onClick={() => go({ child: k.id })}
                className={`rounded-md px-3 py-1.5 text-sm ${props.studentId === k.id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
              >
                {k.full_name}
              </button>
            ))}
          </div>
        )}

        {/* צוות: בחירת כיתה ותלמיד בודד */}
        {isStaff(props.role) && (
          <>
            <select className="input w-auto" aria-label="כיתה" value={props.classId ?? ''}
              onChange={(e) => go({ class: e.target.value, student: null })}>
              {props.classes.map((c) => <option key={c.id} value={c.id}>כיתה {c.name}</option>)}
            </select>
            <select className="input w-auto" aria-label="תלמיד" value={props.studentId ?? ''}
              onChange={(e) => go({ student: e.target.value || null })}>
              <option value="">מערכת כיתתית</option>
              {props.students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </>
        )}

        {/* תלמיד/הורה: אישית מול כיתתית */}
        {!isStaff(props.role) && props.studentId && (
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {(['personal', 'class'] as const).map((s) => (
              <button key={s} onClick={() => go({ scope: s === 'personal' ? null : s })}
                className={`rounded-md px-3 py-1.5 ${props.scope === s ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
                {s === 'personal' ? 'אישית' : `כיתתית${props.className ? ` (${props.className})` : ''}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
