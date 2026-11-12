'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import { addLessons } from '@/lib/api';
import { addMinutes, heDate, schoolDow, weekDates } from '@/lib/dates';
import type { EditScope, Person } from '@/lib/types';
import ScopePicker from '../schedule/ScopePicker';

/** כפתור "+" — הוספת שיעור/פעילות: רק בתאריך הזה / רק השבוע / כל הימים / לכל השנה */
export default function AddLessonModal({
  date, classId, defaultStart, teachers, student, onClose, onSaved,
}: {
  date: string; classId: string; defaultStart: string; teachers: Person[];
  student: Person | null; onClose: () => void; onSaved: () => void;
}) {
  const dow = schoolDow(date) ?? 1;
  const [scope, setScope] = useState<EditScope>('once');
  const [personal, setPersonal] = useState(false);
  const [subject, setSubject] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(addMinutes(defaultStart, 45));
  const [room, setRoom] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true); setError('');
    const base = {
      classId, studentId: personal ? student?.id : null,
      subject, teacher_id: teacherId || null, co_teacher_id: null, teacher_label: null,
      start_time: start, end_time: end, room,
    };
    // once: חד-פעמי היום | week: חד-פעמי בכל ימי השבוע | allDays: קבוע בכל הימים | year: קבוע ביום הזה
    const days = scope === 'once' || scope === 'year' ? [date] : weekDates(date);
    const r = await addLessons(days.map((d) => ({
      ...base, date: scope === 'allDays' ? date : d, dayOfWeek: schoolDow(d) ?? dow, recurring: scope === 'allDays' || scope === 'year',
    })));
    setPending(false);
    if (r.ok) { onSaved(); onClose(); } else setError(r.error);
  };

  return (
    <Modal title="הוספת שיעור / פעילות" subtitle={heDate(date, { weekday: 'long', day: 'numeric', month: 'long' })} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <ScopePicker value={scope} onChange={setScope} date={date} />
        <div>
          <label className="label" htmlFor="al-subject">מקצוע / פעילות</label>
          <input id="al-subject" className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="למשל: תגבור מתמטיקה / הרצאה" />
        </div>
        <div>
          <label className="label" htmlFor="al-teacher">מורה</label>
          <select id="al-teacher" className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">— ללא מורה —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label" htmlFor="al-start">התחלה</label><input id="al-start" type="time" className="input" required value={start}
            onChange={(e) => { setStart(e.target.value); if (e.target.value) setEnd(addMinutes(e.target.value, 45)); }} /></div>
          <div><label className="label" htmlFor="al-end">סיום</label><input id="al-end" type="time" className="input" required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div><label className="label" htmlFor="al-room">חדר</label><input id="al-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} /></div>
        </div>
        {student && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
            שיעור אישי ל{student.full_name} בלבד
          </label>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'שומר…' : 'הוספה'}</button>
        </div>
      </form>
    </Modal>
  );
}
