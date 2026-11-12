'use client';

import { useState } from 'react';
import {
  applyChanges, endLesson, endLessons, fetchSlotLessons, restoreChanges, updateLessonPermanent, updateLessonsPartial,
  type ChangeRow, type LessonFields, type Result,
} from '@/lib/api';
import { heDate, hhmm, schoolDow, weekDates } from '@/lib/dates';
import type { EditScope, Lesson, LessonChangeKind, Occurrence, Person } from '@/lib/types';
import { SPECIAL_NOTE } from '@/lib/types';
import ScopePicker from '../schedule/ScopePicker';
import SpecialActivityPicker, { specialTitle, type SpecialValue } from '../schedule/SpecialActivityPicker';
import ConfirmDialog from '../ui/ConfirmDialog';

const activeOn = (l: Lesson, d: string) =>
  l.day_of_week === schoolDow(d) && (!l.valid_from || d >= l.valid_from) && (!l.valid_to || d <= l.valid_to);

/**
 * עריכת שיעור בסגנון לוח שנה (מחנך / מנהל), עם 4 היקפים:
 *  רק בתאריך הזה · רק השבוע (כל המשבצת, חד-פעמי) · כל הימים (כל המשבצת, קבוע) · לכל השנה (השיעור הזה, קבוע)
 */
export default function LessonEditor({
  occ, classId, teachers, onSaved,
}: { occ: Occurrence; classId: string; teachers: Person[]; onSaved: (msg: string) => void }) {
  const l = occ.lesson;
  const oneTime = !!l.specific_date;
  const [scope, setScope] = useState<EditScope>('once');
  const [mode, setMode] = useState<'edit' | 'special'>('edit');
  const [special, setSpecial] = useState<SpecialValue>({ preset: 'trip', text: '' });
  const [subject, setSubject] = useState(occ.subject);
  const [teacherId, setTeacherId] = useState<string>(occ.teacherId ?? '');
  const [coTeacherId, setCoTeacherId] = useState<string>(l.co_teacher_id ?? '');
  const [label, setLabel] = useState(l.teacher_label ?? '');
  const [start, setStart] = useState(hhmm(occ.start));
  const [end, setEnd] = useState(hhmm(occ.end));
  const [room, setRoom] = useState(occ.room ?? '');
  const [note, setNote] = useState(occ.change?.note && occ.change.note !== SPECIAL_NOTE ? occ.change.note : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  const permanent = scope === 'allDays' || scope === 'year';
  const changed = {
    subject: subject.trim() !== l.subject,
    teacher: (teacherId || null) !== (l.teacher_id || null),
    co: (coTeacherId || null) !== (l.co_teacher_id || null),
    label: (label.trim() || null) !== (l.teacher_label || null),
    time: start !== hhmm(l.start_time) || end !== hhmm(l.end_time),
    room: (room.trim() || null) !== (l.room || null),
  };
  const nothingChanged = !changed.subject && !changed.teacher && !changed.time && !changed.room;

  const run = async (fn: () => Promise<Result>, msg: string) => {
    setPending(true); setError('');
    const r = await fn();
    setPending(false);
    if (r.ok) onSaved(msg); else setError(r.error);
  };

  /** המופעים שהשינוי חל עליהם: היום / כל המשבצת בשבוע הנוכחי */
  const targets = async (): Promise<{ lesson: Lesson; date: string }[]> => {
    if (scope === 'once') return [{ lesson: l, date: occ.date }];
    const slot = await fetchSlotLessons(classId, l.start_time, l.student_id);
    const list = weekDates(occ.date).flatMap((d) => slot.filter((s) => activeOn(s, d)).map((s) => ({ lesson: s, date: d })));
    return list.length ? list : [{ lesson: l, date: occ.date }];
  };

  const editRow = (date: string, lessonId: string): ChangeRow => {
    const kind: LessonChangeKind =
      changed.teacher && teacherId && !changed.subject && !changed.time ? 'substitute'
      : changed.time && !changed.teacher && !changed.subject ? 'moved'
      : !changed.teacher && !changed.subject && !changed.time ? 'room_change'
      : 'modified';
    return {
      lesson_id: lessonId, change_date: date, kind,
      substitute_teacher_id: changed.teacher ? teacherId || null : null,
      new_subject: changed.subject ? subject.trim() : null,
      new_start_time: changed.time ? start : null,
      new_end_time: changed.time ? end : null,
      new_room: changed.room ? room.trim() || null : null,
      note: note.trim() || null,
    };
  };

  const when = scope === 'week' ? 'השבוע' : heDate(occ.date, { weekday: 'long', day: 'numeric', month: 'numeric' });

  const save = () => {
    if (end <= start) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    if (scope === 'once' || scope === 'week') {
      return run(async () => {
        const t = await targets();
        if (nothingChanged && !note.trim()) return restoreChanges(t.map((x) => ({ lessonId: x.lesson.id, date: x.date })));
        return applyChanges(t.map((x) => editRow(x.date, x.lesson.id)));
      }, nothingChanged && !note.trim() ? 'השיעור חזר למערכת הקבועה' : `נשמר שינוי ל${scope === 'week' ? 'כל המשבצת השבוע' : when}`);
    }
    if (scope === 'year') {
      const f: LessonFields = { subject, teacher_id: teacherId || null, co_teacher_id: coTeacherId || null, teacher_label: label, start_time: start, end_time: end, room };
      return run(() => updateLessonPermanent(l.id, f), 'המערכת הקבועה עודכנה');
    }
    // allDays — רק השדות שהשתנו, לכל המשבצת בכל ימי השבוע
    const patch: Partial<LessonFields> = {};
    if (changed.subject) patch.subject = subject.trim();
    if (changed.teacher) patch.teacher_id = teacherId || null;
    if (changed.co) patch.co_teacher_id = coTeacherId || null;
    if (changed.label) patch.teacher_label = label.trim() || null;
    if (changed.time) { patch.start_time = start; patch.end_time = end; }
    if (changed.room) patch.room = room.trim() || null;
    if (!Object.keys(patch).length) { setError('לא בוצע שינוי'); return; }
    return run(async () => {
      const slot = await fetchSlotLessons(classId, l.start_time, l.student_id);
      return updateLessonsPartial(slot.map((s) => s.id), patch);
    }, `עודכנה המשבצת ${hhmm(l.start_time)} בכל ימי השבוע`);
  };

  const cancel = () => {
    if (scope === 'once' || scope === 'week') {
      return run(async () => applyChanges((await targets()).map((x) => ({ lesson_id: x.lesson.id, change_date: x.date, kind: 'cancelled', note: note.trim() || null }))),
        scope === 'week' ? 'המשבצת בוטלה לכל השבוע' : 'השיעור סומן כמבוטל');
    }
    if (scope === 'year') {
      setConfirm({ text: oneTime ? 'למחוק את השיעור החד-פעמי?' : `להסיר את "${l.subject}" מהמערכת הקבועה החל מ-${heDate(occ.date, { day: 'numeric', month: 'numeric' })}?`,
        run: () => run(() => endLesson(l.id, occ.date, oneTime), 'השיעור הוסר מהמערכת') });
      return;
    }
    setConfirm({ text: `להסיר את כל שיעורי המשבצת ${hhmm(l.start_time)} מכל ימי השבוע (מהתאריך הזה והלאה)?`,
      run: () => run(async () => endLessons((await fetchSlotLessons(classId, l.start_time, l.student_id)).map((s) => s.id), occ.date), 'המשבצת הוסרה מהמערכת') });
  };

  const restore = () => run(async () => restoreChanges((await targets()).map((x) => ({ lessonId: x.lesson.id, date: x.date }))), 'חזרה למערכת הקבועה');

  const applySpecial = () => {
    const title = specialTitle(special);
    if (!title) { setError('כתבו מהי הפעילות או הסיבה'); return; }
    return run(async () => applyChanges((await targets()).map((x) => ({
      lesson_id: x.lesson.id, change_date: x.date, kind: 'modified', new_subject: title, note: SPECIAL_NOTE,
    }))), `הוחלף ב: ${title}`);
  };

  const teacherOptions = (
    <>
      <option value="">— ללא מורה —</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
    </>
  );

  return (
    <div className="space-y-4">
      <ScopePicker value={scope} date={occ.date}
        onChange={(s) => { setScope(s); if (s === 'allDays' || s === 'year') setMode('edit'); }}
        disabled={oneTime ? ['week', 'allDays'] : []} />

      <div className="flex gap-1 border-b border-slate-200 text-sm">
        <button type="button" onClick={() => setMode('edit')}
          className={`-mb-px border-b-2 px-3 py-1.5 ${mode === 'edit' ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500'}`}>
          עריכת פרטים
        </button>
        <button type="button" disabled={permanent} onClick={() => setMode('special')}
          className={`-mb-px border-b-2 px-3 py-1.5 disabled:opacity-40 ${mode === 'special' ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500'}`}>
          ✨ החלפה בפעילות מיוחדת
        </button>
      </div>

      {mode === 'special' ? (
        <SpecialActivityPicker value={special} onChange={(v) => { setSpecial(v); setError(''); }} />
      ) : (
        <>
          <div>
            <label className="label" htmlFor="ed-subject">מקצוע / פעילות</label>
            <input id="ed-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className={`grid gap-2 ${permanent ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="label" htmlFor="ed-teacher">{permanent ? 'מורה' : 'מורה (מחליף)'}</label>
              <select id="ed-teacher" className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>{teacherOptions}</select>
            </div>
            {permanent && (
              <div>
                <label className="label" htmlFor="ed-co">מורה שותף</label>
                <select id="ed-co" className="input" value={coTeacherId} onChange={(e) => setCoTeacherId(e.target.value)}>{teacherOptions}</select>
              </div>
            )}
          </div>
          {permanent && (
            <div>
              <label className="label" htmlFor="ed-label">שם מורה לתצוגה (אופציונלי — למורה שאינו במערכת)</label>
              <input id="ed-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label" htmlFor="ed-start">התחלה</label><input id="ed-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="label" htmlFor="ed-end">סיום</label><input id="ed-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div><label className="label" htmlFor="ed-room">חדר</label><input id="ed-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} /></div>
          </div>
          {!permanent && (
            <div>
              <label className="label" htmlFor="ed-note">הערת שינוי לתלמידים</label>
              <input id="ed-note" className="input" placeholder="למשל: השיעור יתקיים במעבדה" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="btn-primary" disabled={pending} onClick={mode === 'special' ? applySpecial : save}>
          {pending ? 'שומר…' : mode === 'special' ? 'החלפה' : 'שמירה'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={pending || (scope === 'once' && occ.status === 'cancelled')} onClick={cancel}>
            {permanent ? 'הסרה מהמערכת' : 'ביטול השיעור'}
          </button>
        )}
        {!permanent && (occ.status !== 'normal' || scope === 'week') && (
          <button type="button" className="btn-ghost" disabled={pending} onClick={restore}>שחזור למקור</button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog title="אישור הסרה" message={confirm.text} confirmLabel="הסרה" danger pending={pending}
          onCancel={() => setConfirm(null)} onConfirm={() => { const r = confirm.run; setConfirm(null); r(); }} />
      )}
    </div>
  );
}
