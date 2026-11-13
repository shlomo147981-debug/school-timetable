'use client';

import { useState, useTransition } from 'react';
import Modal from '../ui/Modal';
import { addAssignment, reportException } from '@/lib/api';
import { heDate, hhmm } from '@/lib/dates';
import type { AssignmentType, ExceptionType, Occurrence, Person } from '@/lib/types';
import { ASSIGNMENT_LABEL, CHANGE_LABEL, EXCEPTION_LABEL, EXCEPTION_STATUS_LABEL } from '@/lib/types';

type Tab = 'exception' | 'assignment';

const EXCEPTION_ICONS: Record<ExceptionType, string> = {
  absence: '🚫', late: '⏰', missing_equipment: '🎒', misbehavior: '⚠️', praise: '⭐',
};

/**
 * מודאל מהיר למורה בלחיצה על שיעור:
 *  1. הערה חריגה (פרטית לתלמיד ולהוריו) — אפשר לסמן כמה תלמידים יחד
 *  2. סיכום שיעור / משימה / מבחן — גלוי לכל הכיתה
 *  3. (מחנך/מנהל) עריכת שיעור: חד-פעמי או קבוע — מקצוע, מורה, שעות, ביטול
 */
export default function TeacherQuickModal({
  occurrence: occ, classId, students, preselectedStudentId, teachers, canEditSchedule, onChanged, onOpenEditor, onClose,
}: {
  occurrence: Occurrence; classId: string; students: Person[]; preselectedStudentId: string | null;
  teachers: Person[]; canEditSchedule: boolean; onChanged: () => void; onOpenEditor: (o: Occurrence) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('exception');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- exception state
  const [picked, setPicked] = useState<Set<string>>(new Set(preselectedStudentId ? [preselectedStudentId] : []));
  const [exType, setExType] = useState<ExceptionType>('late');
  const [exNote, setExNote] = useState('');
  const [filter, setFilter] = useState('');
  // --- assignment state
  const [aType, setAType] = useState<AssignmentType>('homework');
  const [aTitle, setATitle] = useState('');
  const [aDue, setADue] = useState(occ.date);
  const [aDesc, setADesc] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, reset?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg({ ok: true, text: success }); reset?.(); onChanged(); }
      else setMsg({ ok: false, text: r.error ?? 'שגיאה' });
    });

  const toggle = (id: string) =>
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'exception', label: 'הערה חריגה' },
    { id: 'assignment', label: 'סיכום שיעור / משימה' },
  ];

  const shownStudents = students.filter((s) => s.full_name.includes(filter.trim()));

  return (
    <Modal
      title={occ.subject}
      subtitle={`${heDate(occ.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${hhmm(occ.start)}–${hhmm(occ.end)}${occ.room ? ` · חדר ${occ.room}` : ''}`}
      onClose={onClose}
    >
      {occ.studentOverrides.length > 0 && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-2 text-sm text-violet-900">
          <div className="mb-1 font-medium">👤 שינויים פרטניים בשיעור הזה</div>
          <ul className="space-y-0.5">
            {occ.studentOverrides.map((c) => (
              <li key={c.id}>
                {students.find((st) => st.id === c.student_id)?.full_name ?? 'תלמיד/ה'}:{' '}
                {c.kind === 'cancelled' ? 'לא משתתף/ת' : c.new_subject ? `במקום זה: ${c.new_subject}` : CHANGE_LABEL[c.kind]}
                {c.until_date && <span className="text-xs text-violet-700"> (קבוע עד {heDate(c.until_date, { day: 'numeric', month: 'numeric' })})</span>}
                {c.note && !c.note.startsWith('פעילות מיוחדת') && <span className="text-xs text-violet-700"> — {c.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canEditSchedule && (
        <button type="button" onClick={() => onOpenEditor(occ)}
          className="btn mb-3 w-full border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100">
          ✏️ עריכת השיעור (שינוי · ביטול · פעילות מיוחדת · צבע)
        </button>
      )}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setMsg(null); }}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm ${tab === t.id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'exception' && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          run(() => reportException({ lessonId: occ.lesson.id, lessonDate: occ.date, studentIds: [...picked], type: exType, note: exNote }),
            `נרשם עבור ${picked.size} תלמידים`, () => { setExNote(''); if (!preselectedStudentId) setPicked(new Set()); });
        }}>
          <div>
            <span className="label">סוג</span>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(EXCEPTION_LABEL) as ExceptionType[]).map((t) => (
                <button key={t} type="button" onClick={() => setExType(t)}
                  className={`flex flex-col items-center rounded-lg border p-2 text-[11px] ${exType === t
                    ? t === 'praise' ? 'border-emerald-500 bg-emerald-50' : 'border-brand-500 bg-brand-50'
                    : 'border-slate-200'}`}>
                  <span className="text-lg">{EXCEPTION_ICONS[t]}</span>{EXCEPTION_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">תלמידים ({picked.size} נבחרו)</span>
              <input className="input w-36 py-1" placeholder="חיפוש…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {shownStudents.map((s) => (
                <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${picked.has(s.id) ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  {s.full_name}
                </label>
              ))}
              {shownStudents.length === 0 && <p className="col-span-2 p-2 text-center text-xs text-slate-400">אין תלמידים</p>}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="ex-note">הערה (אופציונלי)</label>
            <textarea id="ex-note" className="input" rows={2} value={exNote} onChange={(e) => setExNote(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">🔒 גלוי רק לתלמיד ולהוריו</p>
          </div>

          {occ.events.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-2 text-xs">
              <div className="mb-1 font-medium">כבר נרשם בשיעור זה:</div>
              {occ.events.map((e) => (
                <div key={e.id} className={e.retracted ? 'line-through opacity-60' : ''}>
                  {EXCEPTION_LABEL[e.type]}{e.status && ` · ${EXCEPTION_STATUS_LABEL[e.status]}`}{e.note && ` — ${e.note}`}
                </div>
              ))}
            </div>
          )}
          <Footer pending={pending} msg={msg} label="שמירת הערה" disabled={!picked.size} />
        </form>
      )}

      {tab === 'assignment' && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          run(() => addAssignment({ lessonId: occ.lesson.id, classId, type: aType, title: aTitle, dueDate: aDue, description: aDesc }),
            'נוסף ויופיע לכלל הכיתה', () => { setATitle(''); setADesc(''); });
        }}>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(ASSIGNMENT_LABEL) as AssignmentType[]).map((t) => (
              <button key={t} type="button" onClick={() => setAType(t)}
                className={`rounded-lg border px-2 py-2 text-sm ${aType === t ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>
                {ASSIGNMENT_LABEL[t]}
              </button>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="a-title">כותרת</label>
            <input id="a-title" className="input" required value={aTitle} onChange={(e) => setATitle(e.target.value)}
              placeholder={aType === 'homework' ? 'למשל: עמ׳ 45 תרגילים 1–6' : 'למשל: מבחן בפרק 3'} />
          </div>
          <div>
            <label className="label" htmlFor="a-due">{aType === 'homework' ? 'תאריך הגשה' : 'תאריך'}</label>
            <input id="a-due" type="date" className="input" required value={aDue} onChange={(e) => setADue(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="a-desc">פירוט / סיכום שיעור</label>
            <textarea id="a-desc" className="input" rows={3} value={aDesc} onChange={(e) => setADesc(e.target.value)} />
          </div>
          <Footer pending={pending} msg={msg} label="פרסום לכיתה" />
        </form>
      )}

    </Modal>
  );
}

function Footer({ pending, msg, label, disabled }: { pending: boolean; msg: { ok: boolean; text: string } | null; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
      <span role="status" className={`text-sm ${msg?.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg?.text}</span>
      <button type="submit" className="btn-primary" disabled={pending || disabled}>{pending ? 'שומר…' : label}</button>
    </div>
  );
}
