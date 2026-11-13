'use client';

import { useState } from 'react';
import {
  addCalendarEvent, commitChanges, deleteStudentChanges, endLesson, endLessons, fetchSlotLessons, restoreChanges,
  type ChangeRow, type Result,
} from '@/lib/api';
import { addMinutes, heDate, hhmm, schoolDow, weekDates } from '@/lib/dates';
import type { Lesson, Occurrence, StudentChange } from '@/lib/types';
import { SPECIAL_NOTE } from '@/lib/types';
import SpecialActivityPicker, { specialCalendarKind, specialTitle, type SpecialValue } from './SpecialActivityPicker';
import ConfirmDialog from '../ui/ConfirmDialog';

type DeleteFreq = 'once' | 'week' | 'year';
const DELETE_FREQS: { id: DeleteFreq; label: string }[] = [
  { id: 'once', label: 'חד-פעמי' },
  { id: 'week', label: 'רק השבוע הנוכחי' },
  { id: 'year', label: 'קבוע / עד סוף השנה' },
];

const activeOn = (l: Lesson, d: string) =>
  l.day_of_week === schoolDow(d) && (!l.valid_from || d >= l.valid_from) && (!l.valid_to || d <= l.valid_to);

/**
 * סרגל פעולות גורפות על שיעורים מסומנים.
 *  mode="edit"   — ביטול · הזזת זמנים · פעילות מיוחדת · שחזור
 *  mode="delete" — מחיקה/ביטול: חד-פעמי · רק השבוע · קבוע עד סוף השנה (כפתור "−")
 * בתצוגת תלמיד (studentId) — כל פעולה על שיעור כיתתי נשמרת כדריסה פרטנית לתלמיד בלבד.
 */
export default function BulkBar({
  mode: barMode, selected, classId, studentId, studentName, onDone, onClear, onExit,
}: {
  mode: 'edit' | 'delete'; selected: Occurrence[]; classId: string; studentId: string | null; studentName: string;
  onDone: (msg: string) => void; onClear: () => void; onExit: () => void;
}) {
  const [mode, setMode] = useState<'none' | 'shift' | 'special'>('none');
  const [minutes, setMinutes] = useState(15);
  const [special, setSpecial] = useState<SpecialValue>({ preset: 'trip', text: '' });
  const [delFreq, setDelFreq] = useState<DeleteFreq>('once');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const n = selected.length;
  const forStudent = !!studentId;

  // שומר על שינויים קיימים (מחליף/מקצוע) ומוסיף עליהם
  const base = (o: Occurrence): ChangeRow => ({
    lesson_id: o.lesson.id,
    change_date: o.date,
    kind: o.change?.kind ?? 'modified',
    substitute_teacher_id: o.change?.substitute_teacher_id ?? null,
    new_subject: o.change?.new_subject ?? null,
    new_start_time: o.change?.new_start_time ?? null,
    new_end_time: o.change?.new_end_time ?? null,
    new_room: o.change?.new_room ?? null,
    new_color: o.change?.new_color ?? null,
    note: o.change?.note ?? null,
  });
  const commit = (rows: { o: Pick<Occurrence, 'lesson'>; row: ChangeRow; recurring?: boolean }[]) =>
    commitChanges(studentId, rows.map((r) => ({ lesson: r.o.lesson, row: r.row, recurring: r.recurring })));

  const run = async (fn: () => Promise<Result>, msg: string) => {
    setPending(true); setError('');
    try {
      const r = await fn();
      if (r.ok) { setMode('none'); onDone(msg); } else setError(r.error);
    } catch { setError('הפעולה נכשלה — בדקו את החיבור'); }
    finally { setPending(false); }
  };

  // ---------------- מצב עריכה
  const cancelAll = () => run(() => commit(selected.map((o) => ({ o, row: { ...base(o), kind: 'cancelled' } }))), `${n} שיעורים בוטלו`);
  const restoreAll = () => run(async () => {
    const studentIds = selected.filter((o) => o.personalOverride && o.change).map((o) => (o.change as StudentChange).id);
    const classOnes = selected.filter((o) => !o.personalOverride).map((o) => ({ lessonId: o.lesson.id, date: o.date }));
    const a = await deleteStudentChanges(studentIds); if (!a.ok) return a;
    // בתצוגת תלמיד לא משחזרים שינויים כיתתיים (הם של כל הכיתה) — רק בשיעורים האישיים שלו
    return restoreChanges(forStudent ? classOnes.filter((c) => selected.find((o) => o.lesson.id === c.lessonId)?.lesson.student_id) : classOnes);
  }, `${n} שיעורים שוחזרו`);
  const shiftAll = () => run(() => commit(selected.map((o) => ({ o, row: {
    ...base(o),
    kind: o.status === 'normal' || o.status === 'moved' ? 'moved' : 'modified',
    new_start_time: addMinutes(hhmm(o.start), minutes),
    new_end_time: addMinutes(hhmm(o.end), minutes),
  } }))), `${n} שיעורים הוזזו ב-${minutes} דקות`);
  const applySpecial = () => {
    const title = specialTitle(special);
    if (!title) { setError('כתבו מהי הפעילות או הסיבה'); return; }
    const calKind = forStudent ? null : specialCalendarKind(special);  // אירוע לוח — רק לכל הכיתה
    return run(async () => {
      const r = await commit(selected.map((o) => ({ o, row: {
        lesson_id: o.lesson.id, change_date: o.date, kind: 'modified', new_subject: title, note: SPECIAL_NOTE,
        new_start_time: o.change?.new_start_time ?? null, new_end_time: o.change?.new_end_time ?? null,
      } })));
      if (!r.ok || !calKind) return r;
      for (const d of [...new Set(selected.map((o) => o.date))].sort()) {
        const e = await addCalendarEvent({ classId, kind: calKind, title, startDate: d, endDate: d });
        if (!e.ok) return e;
      }
      return { ok: true };
    }, `הוחלף בפעילות: ${title}`);
  };

  // ---------------- מצב מחיקה (−)
  const doDelete = () => run(async () => {
    const items: { o: Pick<Occurrence, 'lesson'>; row: ChangeRow; recurring?: boolean }[] = [];
    const cancelRow = (lesson: Lesson, d: string): ChangeRow => ({ lesson_id: lesson.id, change_date: d, kind: 'cancelled' });

    if (delFreq === 'once') {
      selected.forEach((o) => items.push({ o, row: cancelRow(o.lesson, o.date) }));
    } else if (delFreq === 'week') {
      // אותה משבצת שעה בכל ימי השבוע הנוכחי
      const seen = new Set<string>();
      for (const o of selected) {
        const slot = await fetchSlotLessons(classId, o.lesson.start_time, o.lesson.student_id);
        const lessons = slot.length ? slot : [o.lesson];
        for (const d of weekDates(o.date)) for (const l of lessons) {
          if (!activeOn(l, d) || seen.has(`${l.id}|${d}`)) continue;
          seen.add(`${l.id}|${d}`);
          items.push({ o: { lesson: l }, row: cancelRow(l, d) });
        }
      }
      // שיעורים חד-פעמיים שסומנו — רק בתאריך שלהם
      selected.filter((o) => o.lesson.specific_date).forEach((o) => items.push({ o, row: cancelRow(o.lesson, o.date) }));
    } else {
      // קבוע: כיתתי → הסרה מהמערכת מהתאריך; תלמיד → דריסה פרטנית חוזרת עד סוף השנה
      const permanentClass = selected.filter((o) => !forStudent || o.lesson.student_id);
      for (const o of permanentClass) {
        const r = o.lesson.specific_date ? await endLesson(o.lesson.id, o.date, true) : await endLessons([o.lesson.id], o.date);
        if (!r.ok) return r;
      }
      selected.filter((o) => forStudent && !o.lesson.student_id)
        .forEach((o) => items.push({ o, row: cancelRow(o.lesson, o.date), recurring: true }));
      if (!items.length) return { ok: true };
    }
    return commit(items);
  }, delFreq === 'year' ? `${n} שיעורים הוסרו${forStudent ? ` ל${studentName}` : ''} עד סוף השנה` : `${n} שיעורים בוטלו${forStudent ? ` ל${studentName}` : ''}`);

  const scopeNote = forStudent
    ? <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-900">👤 רק עבור {studentName}</span>
    : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">לכל הכיתה</span>;

  return (
    <div className={`safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur ${barMode === 'delete' ? 'border-red-200' : 'border-slate-200'}`}>
      <div className="mx-auto max-w-7xl space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {barMode === 'delete' && <span className="text-red-700">🗑️ מצב מחיקה · </span>}
            {n ? `${n} שיעורים מסומנים` : 'סמנו שיעורים או "בחר יום שלם"'}
          </span>
          {scopeNote}
          <div className="ms-auto flex flex-wrap gap-1.5">
            {barMode === 'edit' ? (
              <>
                <button className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={!n || pending} onClick={cancelAll}>ביטול</button>
                <button className={`btn ${mode === 'shift' ? 'bg-brand-100' : 'bg-slate-100'}`} disabled={!n || pending} onClick={() => setMode(mode === 'shift' ? 'none' : 'shift')}>הזזת זמנים</button>
                <button className={`btn ${mode === 'special' ? 'bg-brand-100' : 'bg-slate-100'}`} disabled={!n || pending} onClick={() => setMode(mode === 'special' ? 'none' : 'special')}>פעילות מיוחדת</button>
                <button className="btn bg-slate-100" disabled={!n || pending} onClick={restoreAll}>שחזור</button>
              </>
            ) : (
              <>
                <select className="input w-auto py-1.5" aria-label="תדירות המחיקה" value={delFreq} onChange={(e) => setDelFreq(e.target.value as DeleteFreq)}>
                  {DELETE_FREQS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={!n || pending}
                  onClick={() => (delFreq === 'year' ? setConfirm(true) : doDelete())}>
                  {pending ? 'מוחק…' : 'מחיקה'}
                </button>
              </>
            )}
            <button className="btn-ghost" disabled={!n} onClick={onClear}>ניקוי</button>
            <button className="btn-primary" onClick={onExit}>סיום</button>
          </div>
        </div>
        {barMode === 'edit' && mode === 'shift' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>הזזה ב-</span>
            {[-30, -15, 15, 30, 45].map((m) => (
              <button key={m} className={`btn ${minutes === m ? 'bg-brand-100 text-brand-700' : 'bg-slate-100'}`} onClick={() => setMinutes(m)} dir="ltr">{m > 0 ? `+${m}` : m}</button>
            ))}
            <input type="number" className="input w-20" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} aria-label="דקות" />
            <span>דקות</span>
            <button className="btn-primary" disabled={pending || !minutes} onClick={shiftAll}>החלה</button>
          </div>
        )}
        {barMode === 'edit' && mode === 'special' && (
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <div className="min-w-[16rem] flex-1"><SpecialActivityPicker value={special} onChange={(v) => { setSpecial(v); setError(''); }} /></div>
            <button className="btn-primary" disabled={pending} onClick={applySpecial}>החלפה</button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      {confirm && (
        <ConfirmDialog
          title="מחיקה קבועה"
          message={forStudent
            ? `${n} השיעורים המסומנים יבוטלו עבור ${studentName} בלבד, בכל שבוע עד סוף השנה. שאר הכיתה ממשיכה כרגיל.`
            : `${n} השיעורים המסומנים יוסרו ממערכת הכיתה החל מ-${heDate(selected[0]?.date ?? '', { day: 'numeric', month: 'numeric' })} ועד סוף השנה.`}
          confirmLabel="מחיקה קבועה" danger pending={pending}
          onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); doDelete(); }} />
      )}
    </div>
  );
}
