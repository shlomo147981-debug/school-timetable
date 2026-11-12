'use client';

import { useState } from 'react';
import { applyChanges, endLesson, restoreChanges, updateLessonPermanent, type ChangeRow } from '@/lib/api';
import { heDate, hhmm } from '@/lib/dates';
import type { Occurrence, Person } from '@/lib/types';

type Scope = 'once' | 'always';

/**
 * עריכת שיעור בסגנון לוח שנה (מחנך / מנהל):
 *  "רק בתאריך הזה" → lesson_changes (חד-פעמי)   |   "כל שבוע" → עדכון התבנית הקבועה (lessons)
 */
export default function LessonEditor({
  occ, teachers, onSaved,
}: { occ: Occurrence; teachers: Person[]; onSaved: (msg: string) => void }) {
  const l = occ.lesson;
  const [scope, setScope] = useState<Scope>('once');
  const [subject, setSubject] = useState(occ.subject);
  const [teacherId, setTeacherId] = useState<string>(occ.teacherId ?? '');
  const [coTeacherId, setCoTeacherId] = useState<string>(l.co_teacher_id ?? '');
  const [label, setLabel] = useState(l.teacher_label ?? '');
  const [start, setStart] = useState(hhmm(occ.start));
  const [end, setEnd] = useState(hhmm(occ.end));
  const [room, setRoom] = useState(occ.room ?? '');
  const [note, setNote] = useState(occ.change?.note ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true); setError('');
    const r = await fn();
    setPending(false);
    if (r.ok) onSaved(msg); else setError(r.error ?? 'שגיאה');
  };

  const saveOnce = () => {
    const teacherChanged = (teacherId || null) !== (l.teacher_id || null);
    const subjectChanged = subject.trim() !== l.subject;
    const timeChanged = start !== hhmm(l.start_time) || end !== hhmm(l.end_time);
    const roomChanged = (room.trim() || null) !== (l.room || null);
    if (!teacherChanged && !subjectChanged && !timeChanged && !roomChanged && !note.trim()) {
      return run(() => restoreChanges([{ lessonId: l.id, date: occ.date }]), 'השיעור חזר למערכת הקבועה');
    }
    if (end <= start) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    const onlyTeacher = teacherChanged && !subjectChanged && !timeChanged;
    const onlyTime = timeChanged && !teacherChanged && !subjectChanged;
    const row: ChangeRow = {
      lesson_id: l.id,
      change_date: occ.date,
      kind: onlyTeacher && teacherId ? 'substitute' : onlyTime ? 'moved' : !teacherChanged && !subjectChanged && !timeChanged ? 'room_change' : 'modified',
      substitute_teacher_id: teacherChanged ? teacherId || null : null,
      new_subject: subjectChanged ? subject.trim() : null,
      new_start_time: timeChanged ? start : null,
      new_end_time: timeChanged ? end : null,
      new_room: roomChanged ? room.trim() || null : null,
      note: note.trim() || null,
    };
    return run(() => applyChanges([row]), `נשמר שינוי ל-${heDate(occ.date, { weekday: 'long', day: 'numeric', month: 'numeric' })}`);
  };

  const saveAlways = () =>
    run(() => updateLessonPermanent(l.id, {
      subject, teacher_id: teacherId || null, co_teacher_id: coTeacherId || null,
      teacher_label: label, start_time: start, end_time: end, room,
    }), 'המערכת הקבועה עודכנה');

  const teacherOptions = (
    <>
      <option value="">— ללא מורה —</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
    </>
  );

  return (
    <div className="space-y-4">
      {/* היקף השינוי — כמו "אירוע זה / כל האירועים" ביומן */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <button type="button" onClick={() => setScope('once')}
          className={`rounded-md px-2 py-1.5 ${scope === 'once' ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
          רק ב-{heDate(occ.date, { day: 'numeric', month: 'numeric' })}
        </button>
        <button type="button" onClick={() => setScope('always')} disabled={!!l.specific_date}
          className={`rounded-md px-2 py-1.5 disabled:opacity-40 ${scope === 'always' ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
          כל שבוע (קבוע)
        </button>
      </div>

      <div>
        <label className="label" htmlFor="ed-subject">מקצוע / פעילות</label>
        <input id="ed-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className={`grid gap-2 ${scope === 'always' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="label" htmlFor="ed-teacher">{scope === 'once' ? 'מורה (מחליף)' : 'מורה'}</label>
          <select id="ed-teacher" className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>{teacherOptions}</select>
        </div>
        {scope === 'always' && (
          <div>
            <label className="label" htmlFor="ed-co">מורה שותף</label>
            <select id="ed-co" className="input" value={coTeacherId} onChange={(e) => setCoTeacherId(e.target.value)}>{teacherOptions}</select>
          </div>
        )}
      </div>
      {scope === 'always' && (
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
      {scope === 'once' && (
        <div>
          <label className="label" htmlFor="ed-note">הערת שינוי לתלמידים</label>
          <input id="ed-note" className="input" placeholder="למשל: השיעור יתקיים במעבדה" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="btn-primary" disabled={pending} onClick={scope === 'once' ? saveOnce : saveAlways}>
          {pending ? 'שומר…' : 'שמירה'}
        </button>
        {scope === 'once' ? (
          <>
            <button type="button" className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={pending || occ.status === 'cancelled'}
              onClick={() => run(() => applyChanges([{ lesson_id: l.id, change_date: occ.date, kind: 'cancelled', note: note.trim() || null }]), 'השיעור סומן כמבוטל')}>
              ביטול השיעור
            </button>
            {occ.status !== 'normal' && (
              <button type="button" className="btn-ghost" disabled={pending}
                onClick={() => run(() => restoreChanges([{ lessonId: l.id, date: occ.date }]), 'השיעור חזר למערכת הקבועה')}>
                שחזור למקור
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={pending}
            onClick={() => { if (confirm('להסיר את השיעור מהמערכת הקבועה החל מתאריך זה?')) run(() => endLesson(l.id, occ.date, false), 'השיעור הוסר מהמערכת הקבועה'); }}>
            הסרה מהמערכת
          </button>
        )}
        {l.specific_date && (
          <button type="button" className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={pending}
            onClick={() => { if (confirm('למחוק את השיעור החד-פעמי?')) run(() => endLesson(l.id, occ.date, true), 'השיעור נמחק'); }}>
            מחיקת שיעור חד-פעמי
          </button>
        )}
      </div>
    </div>
  );
}
