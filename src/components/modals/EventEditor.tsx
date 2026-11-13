'use client';

/**
 * עורך שיעור/אירוע במסך מלא — בהשראת Google Calendar במובייל.
 * כותרת: ✕ (ימין) · שמירה (שמאל).
 * פעולות: הוספת שיעור · שינוי שיעור · ביטול / שחרור מוקדם · פעילות מיוחדת.
 * תדירות: חד-פעמי · רק השבוע הנוכחי · כל ימי השבוע (א'-ה') · חוזר כל שבוע עד סוף השנה.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addCalendarEvent, addLessons, commitChanges, dbSupportsExtras, endLesson, endLessons, fetchClassLessons, fetchStudentLessons,
  updateLessonPermanent, updateLessonsPartial, type ChangeRow, type LessonFields, type Result,
} from '@/lib/api';
import { STUDENT_SQL_HINT, supportsStudentOverrides } from '@/lib/schema';
import { addDays, addMinutes, heDate, hhmm, schoolDow, weekDates } from '@/lib/dates';
import { COLORS } from '@/lib/colors';
import type { EditScope, Lesson, LessonChangeKind, Occurrence, Person } from '@/lib/types';
import { EARLY_DISMISSAL_PREFIX, SPECIAL_NOTE, isSpecialNote, specialDetail } from '@/lib/types';
import SpecialActivityPicker, { specialCalendarKind, specialTitle, type SpecialValue } from '../schedule/SpecialActivityPicker';
import ConfirmDialog from '../ui/ConfirmDialog';

type Action = 'add' | 'edit' | 'cancel' | 'special';
type CancelMode = 'lesson' | 'day' | 'early';

const ACTIONS: { id: Action; label: string; icon: string }[] = [
  { id: 'add', label: 'הוספת שיעור', icon: '➕' },
  { id: 'edit', label: 'שינוי שיעור', icon: '✏️' },
  { id: 'cancel', label: 'ביטול / שחרור מוקדם', icon: '🚫' },
  { id: 'special', label: 'פעילות מיוחדת', icon: '✨' },
];

const FREQS: { id: EditScope; label: string }[] = [
  { id: 'once', label: 'חד-פעמי (רק בתאריך שנבחר)' },
  { id: 'week', label: 'רק השבוע הנוכחי' },
  { id: 'allDays', label: "כל ימי השבוע (א'-ה') באותה שעה" },
  { id: 'year', label: 'חוזר כל שבוע עד סוף השנה (קבוע)' },
];

const OTHER = '__other';

const activeOn = (l: Lesson, d: string) =>
  l.specific_date ? l.specific_date === d
    : l.day_of_week === schoolDow(d) && (!l.valid_from || d >= l.valid_from) && (!l.valid_to || d <= l.valid_to);

/** ימי לימודים (א'-ה') בטווח, עד 31 */
const schoolDaysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 31; d = addDays(d, 1)) if (schoolDow(d)) out.push(d);
  return out;
};

const overlaps = (l: Lesson, s: string, e: string) => hhmm(l.start_time) < e && hhmm(l.end_time) > s;

export interface EditorSaved { classId: string; date: string }

export default function EventEditor({
  classes, initialClassId, teachers, date, occurrence, student = null, onClose, onSaved,
}: {
  classes: { id: string; name: string }[];
  initialClassId: string;
  teachers: Person[];
  date: string;
  occurrence?: Occurrence | null;
  /** תלמיד מוצג — אז כל השינויים נשמרים רק עבורו */
  student?: Person | null;
  onClose: () => void;
  onSaved: (msg: string, where: EditorSaved) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);

  const occ = occurrence ?? null;
  const [classId, setClassId] = useState(initialClassId);
  const [action, setAction] = useState<Action>(occ ? 'edit' : 'add');
  const [lessons, setLessons] = useState<Lesson[]>(occ ? [occ.lesson] : []);
  const [targetId, setTargetId] = useState<string>(occ?.lesson.id ?? '');
  const [startDate, setStartDate] = useState(occ?.date ?? date);
  const [endDate, setEndDate] = useState(occ?.date ?? date);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(occ ? hhmm(occ.start) : '08:15');
  const [endTime, setEndTime] = useState(occ ? hhmm(occ.end) : '09:00');
  const [title, setTitle] = useState(occ?.subject ?? '');
  const [teacherSel, setTeacherSel] = useState<string>(occ ? (occ.lesson.teacher_label ? OTHER : occ.teacherId ?? '') : '');
  const [teacherText, setTeacherText] = useState(occ?.lesson.teacher_label ?? '');
  const [room, setRoom] = useState(occ?.room ?? '');
  const [freq, setFreq] = useState<EditScope>('once');
  const [color, setColor] = useState<string | null>(occ?.change?.new_color ?? occ?.lesson.color ?? null);
  const [note, setNote] = useState(occ ? (isSpecialNote(occ.change?.note) ? specialDetail(occ.change?.note) : occ.change?.note ?? occ.lesson.note ?? '') : '');
  const [special, setSpecial] = useState<SpecialValue>({ preset: 'trip', text: '' });
  const [cancelMode, setCancelMode] = useState<CancelMode>('lesson');
  const [earlyTime, setEarlyTime] = useState('12:55');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  // הקשר תלמיד: בתצוגת תלמיד — כל פעולה נשמרת רק עבורו (דריסה פרטנית / שיעור אישי)
  const studentCtx = student && classId === initialClassId ? student : null;
  const [overridesReady, setOverridesReady] = useState(true);
  useEffect(() => { if (studentCtx) supportsStudentOverrides().then(setOverridesReady); }, [studentCtx?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // טעינת שיעורי הכיתה (+ האישיים של התלמיד). השמירה נחסמת עד הטעינה.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadKey = `${classId}|${studentCtx?.id ?? ''}`;
  const loaded = loadedFor === loadKey;
  useEffect(() => {
    let alive = true;
    setLoadedFor(null);
    Promise.all([fetchClassLessons(classId), studentCtx ? fetchStudentLessons(classId, studentCtx.id) : Promise.resolve([])])
      .then(([cls, mine]) => {
        if (!alive) return;
        const all = [...cls, ...mine];
        setLessons(all.length ? all : occ && occ.lesson.class_id === classId ? [occ.lesson] : []);
        setLoadedFor(loadKey);
      })
      .catch(() => { if (alive) setError('טעינת שיעורי הכיתה נכשלה — בדקו את החיבור'); });
    return () => { alive = false; };
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** שיעורים רלוונטיים: כיתתיים + האישיים של התלמיד המוצג */
  const relevant = (l: Lesson) => !l.student_id || (!!studentCtx && l.student_id === studentCtx.id);
  const dayLessons = useMemo(() => lessons.filter((l) => activeOn(l, startDate) && relevant(l))
    .sort((a, b) => a.start_time.localeCompare(b.start_time)), [lessons, startDate, studentCtx?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = lessons.find((l) => l.id === targetId) ?? null;
  /** שיעור כיתתי בתצוגת תלמיד → דריסה פרטנית (ולא שינוי של הכיתה) */
  const overrideOf = (l: Lesson | null) => !!studentCtx && !!l && !l.student_id;

  // בחירת שיעור → מילוי השדות מהמערכת הקבועה
  const pickTarget = (l: Lesson) => {
    setTargetId(l.id);
    setTitle(l.subject);
    setTeacherSel(l.teacher_label ? OTHER : l.teacher_id ?? '');
    setTeacherText(l.teacher_label ?? '');
    setStartTime(hhmm(l.start_time)); setEndTime(hhmm(l.end_time));
    setRoom(l.room ?? ''); setColor(l.color ?? null); setNote(l.note ?? '');
  };

  // אילו תדירויות מותרות בכל פעולה
  const allowed: EditScope[] =
    action === 'add' ? (allDay ? ['once'] : ['once', 'week', 'allDays', 'year'])
    : action === 'edit' ? (target?.specific_date ? ['once', 'year'] : ['once', 'week', 'allDays', 'year'])
    : action === 'cancel' ? (cancelMode === 'lesson' ? (target?.specific_date ? ['once', 'year'] : ['once', 'week', 'allDays', 'year']) : ['once', 'week'])
    : ['once', 'week'];
  useEffect(() => { if (!allowed.includes(freq)) setFreq(allowed[0]); }, [allowed.join(), freq]); // eslint-disable-line react-hooks/exhaustive-deps
  // "כל היום" בהוספה = אירוע לוח לכל הכיתה — לא זמין בתצוגת תלמיד
  useEffect(() => { if (studentCtx && action === 'add' && allDay) setAllDay(false); }, [studentCtx, action, allDay]);

  const needsTarget = action === 'edit' || (action === 'cancel' && cancelMode === 'lesson');
  const showTime = action === 'add' ? !allDay : action === 'edit' ? true : action === 'special' ? !allDay : false;
  const showEndDate = freq === 'once' && (action === 'add' ? allDay : action === 'special' || (action === 'cancel' && cancelMode !== 'lesson'));

  const teacherId = teacherSel && teacherSel !== OTHER ? teacherSel : null;
  const teacherLabel = teacherSel === OTHER ? teacherText.trim() || null : null;

  /** תאריכים שהפעולה חלה עליהם (חד-פעמי: טווח; השבוע: א'-ה' של שבוע תאריך ההתחלה) */
  const dates = () => (freq === 'week' ? weekDates(startDate) : schoolDaysBetween(startDate, showEndDate ? endDate : startDate));
  /** אותה משבצת שעה בכל ימי השבוע (כיתתי, או האישיים של התלמיד אם השיעור אישי) */
  const slotOf = (l: Lesson) => lessons.filter((x) => (x.student_id ?? null) === (l.student_id ?? null) && !x.specific_date && x.start_time === l.start_time);
  /** כתיבת שינויים לפי ההקשר (כיתה / תלמיד) */
  const commit = (items: { lesson: Lesson; row: ChangeRow; recurring?: boolean }[]) => commitChanges(studentCtx?.id ?? null, items);
  const who = studentCtx ? ` עבור ${studentCtx.full_name}` : '';

  const run = async (fn: () => Promise<Result>, msg: string) => {
    setPending(true); setError('');
    try {
      const r = await fn();
      if (r.ok) { onSaved(msg, { classId, date: startDate }); ref.current?.close(); }
      else setError(r.error);
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור');
    } finally {
      setPending(false);
    }
  };

  const fieldsForAdd = (): LessonFields => ({
    subject: title, teacher_id: teacherId, co_teacher_id: null, teacher_label: teacherLabel,
    start_time: startTime, end_time: endTime, room, color, note,
  });

  // ------------------------------------------------------------- שמירה
  const save = () => {
    setError('');
    if (!loaded) { setError('רגע — שיעורי הכיתה עדיין נטענים'); return; }
    if (!schoolDow(startDate)) { setError('יש לבחור יום לימודים (א׳–ה׳)'); return; }
    if (showEndDate && endDate < startDate) { setError('תאריך הסיום לפני תאריך ההתחלה'); return; }
    if (showTime && endTime <= startTime) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    if (needsTarget && !target) { setError('בחרו שיעור מהרשימה'); return; }

    // ---- הוספה (בתצוגת תלמיד: שיעור אישי שלו)
    if (action === 'add') {
      if (!title.trim()) { setError('יש להזין שם לשיעור / לפעילות'); return; }
      if (allDay) {
        return run(() => addCalendarEvent({ classId, kind: 'event', title: title.trim(), startDate, endDate: endDate < startDate ? startDate : endDate }),
          `נוסף אירוע: ${title.trim()}`);
      }
      const f = { ...fieldsForAdd(), classId, studentId: studentCtx?.id ?? null };
      const rows =
        freq === 'once' ? dates().map((d) => ({ ...f, date: d, dayOfWeek: schoolDow(d)!, recurring: false }))
        : freq === 'week' ? weekDates(startDate).map((d) => ({ ...f, date: d, dayOfWeek: schoolDow(d)!, recurring: false }))
        : freq === 'allDays' ? weekDates(startDate).map((d) => ({ ...f, date: startDate, dayOfWeek: schoolDow(d)!, recurring: true }))
        : [{ ...f, date: startDate, dayOfWeek: schoolDow(startDate)!, recurring: true }];
      return run(() => addLessons(rows), `נוסף: ${title.trim()}${who}`);
    }

    // ---- שינוי שיעור
    if (action === 'edit' && target) {
      const t = target;
      const changed = {
        subject: title.trim() !== t.subject,
        teacher: (teacherId || null) !== (t.teacher_id || null) || (teacherLabel || null) !== (t.teacher_label || null),
        time: startTime !== hhmm(t.start_time) || endTime !== hhmm(t.end_time),
        room: (room.trim() || null) !== (t.room || null),
        color: (color || null) !== (t.color || null),
      };
      const kind: LessonChangeKind =
        changed.teacher && teacherId && !changed.subject && !changed.time ? 'substitute'
        : changed.time && !changed.teacher && !changed.subject ? 'moved'
        : !changed.teacher && !changed.subject && !changed.time && changed.room ? 'room_change' : 'modified';
      const row = (lessonId: string, d: string): ChangeRow => ({
        lesson_id: lessonId, change_date: d, kind,
        substitute_teacher_id: changed.teacher ? teacherId : null,
        new_subject: changed.subject ? title.trim() : null,
        new_start_time: changed.time ? startTime : null,
        new_end_time: changed.time ? endTime : null,
        new_room: changed.room ? room.trim() || null : null,
        new_color: changed.color ? color : null,
        note: note.trim() || null,
      });
      const isOverride = overrideOf(t);
      if (freq === 'once' || freq === 'week' || isOverride) {
        if (changed.teacher && teacherLabel && !teacherId) { setError('בשינוי לתאריך / לתלמיד יש לבחור מורה מהרשימה'); return; }
        const items =
          freq === 'once' ? [{ lesson: t, row: row(t.id, startDate) }]
          : freq === 'week' ? weekDates(startDate).flatMap((d) => slotOf(t).filter((l) => activeOn(l, d)).map((l) => ({ lesson: l, row: row(l.id, d) })))
          // תלמיד + קבוע: דריסה פרטנית שחוזרת כל שבוע עד סוף השנה
          : freq === 'allDays' ? slotOf(t).map((l) => ({ lesson: l, row: row(l.id, startDate), recurring: true }))
          : [{ lesson: t, row: row(t.id, startDate), recurring: true }];
        if (!items.length) { setError('השיעור לא מתקיים בתאריך שנבחר'); return; }
        return run(() => commit(items), (freq === 'week' ? 'השינוי נשמר לכל השבוע' : freq === 'once' ? 'השינוי נשמר' : 'השינוי נשמר עד סוף השנה') + who);
      }
      const full: LessonFields = {
        subject: title, teacher_id: teacherId, co_teacher_id: t.co_teacher_id, teacher_label: teacherLabel,
        start_time: startTime, end_time: endTime, room, color, note,
      };
      if (freq === 'year') return run(() => updateLessonPermanent(t.id, full), 'המערכת הקבועה עודכנה' + who);
      const patch: Partial<LessonFields> = {};
      if (changed.subject) patch.subject = title.trim();
      if (changed.teacher) { patch.teacher_id = teacherId; patch.teacher_label = teacherLabel; }
      if (changed.time) { patch.start_time = startTime; patch.end_time = endTime; }
      if (changed.room) patch.room = room.trim() || null;
      if (changed.color) patch.color = color;
      if ((note.trim() || null) !== (t.note || null)) patch.note = note.trim() || null;
      if (!Object.keys(patch).length) { setError('לא בוצע שינוי'); return; }
      return run(() => updateLessonsPartial(slotOf(t).map((l) => l.id), patch), `עודכנה המשבצת ${hhmm(t.start_time)} בכל ימי השבוע${who}`);
    }

    // ---- ביטול / שחרור מוקדם
    if (action === 'cancel') {
      const reason = note.trim() || null;
      const cancelRow = (l: Lesson, d: string, n: string | null = reason): ChangeRow => ({ lesson_id: l.id, change_date: d, kind: 'cancelled', note: n });
      if (cancelMode === 'lesson' && target) {
        const isOverride = overrideOf(target);
        if (freq === 'year' || freq === 'allDays') {
          const list = freq === 'year' ? [target] : slotOf(target);
          const text = isOverride
            ? `לבטל את ${freq === 'year' ? `"${target.subject}"` : `כל שיעורי המשבצת ${hhmm(target.start_time)}`} עבור ${studentCtx!.full_name} בלבד, בכל שבוע עד סוף השנה? שאר הכיתה ממשיכה כרגיל.`
            : freq === 'year' ? `להסיר את "${target.subject}" מהמערכת הקבועה החל מ-${heDate(startDate, { day: 'numeric', month: 'numeric' })}?`
            : `להסיר את כל שיעורי המשבצת ${hhmm(target.start_time)} מכל ימי השבוע (מהתאריך הזה והלאה)?`;
          setConfirm({ text, run: () => run(
            () => (isOverride
              ? commit(list.map((l) => ({ lesson: l, row: cancelRow(l, startDate), recurring: true })))
              : freq === 'year' ? endLesson(target.id, startDate, !!target.specific_date) : endLessons(list.map((l) => l.id), startDate)),
            (isOverride ? `בוטל${who} עד סוף השנה` : 'הוסר מהמערכת')) });
          return;
        }
        const items = freq === 'once' ? [{ lesson: target, row: cancelRow(target, startDate) }]
          : weekDates(startDate).flatMap((d) => slotOf(target).filter((l) => activeOn(l, d)).map((l) => ({ lesson: l, row: cancelRow(l, d) })));
        return run(() => commit(items), (freq === 'week' ? 'השיעור בוטל לכל השבוע' : 'השיעור בוטל') + who);
      }
      const ds = dates();
      if (cancelMode === 'day') {
        const items = ds.flatMap((d) => lessons.filter((l) => relevant(l) && activeOn(l, d)).map((l) => ({ lesson: l, row: cancelRow(l, d) })));
        if (!items.length) { setError('אין שיעורים לבטל בתאריכים שנבחרו'); return; }
        return run(() => commit(items), `בוטלו ${items.length} שיעורים${who}`);
      }
      // שחרור מוקדם: ביטול כל השיעורים מהשעה שנבחרה + הודעה (לכל הכיתה — גם אירוע בלוח)
      const msg = `${EARLY_DISMISSAL_PREFIX} ${earlyTime}`;
      return run(async () => {
        const items = ds.flatMap((d) => lessons.filter((l) => relevant(l) && activeOn(l, d) && hhmm(l.start_time) >= earlyTime)
          .map((l) => ({ lesson: l, row: cancelRow(l, d, reason ?? msg) })));
        if (items.length) { const r = await commit(items); if (!r.ok) return r; }
        if (!studentCtx) for (const d of ds) {
          const e = await addCalendarEvent({ classId, kind: 'event', title: reason ? `${msg} — ${reason}` : msg, startDate: d, endDate: d });
          if (!e.ok) return e;
        }
        return { ok: true };
      }, msg + who);
    }

    // ---- פעילות מיוחדת: מחליפה את השיעורים בטווח השעות (או כל היום)
    const st = specialTitle(special);
    if (!st) { setError('כתבו מהי הפעילות או הסיבה'); return; }
    const marker = note.trim() ? `${SPECIAL_NOTE}: ${note.trim()}` : SPECIAL_NOTE;
    const calKind = studentCtx ? null : specialCalendarKind(special) ?? (allDay ? 'event' : null);
    return run(async () => {
      const ds = dates();
      const items: { lesson: Lesson; row: ChangeRow }[] = [];
      const newOnes: Parameters<typeof addLessons>[0] = [];
      for (const d of ds) {
        const hit = lessons.filter((l) => relevant(l) && activeOn(l, d) && (allDay || overlaps(l, startTime, endTime)));
        if (hit.length) hit.forEach((l) => items.push({ lesson: l, row: { lesson_id: l.id, change_date: d, kind: 'modified', new_subject: st, new_color: color, note: marker } }));
        else if (!allDay) newOnes.push({ subject: st, teacher_id: null, co_teacher_id: null, teacher_label: null, start_time: startTime, end_time: endTime, room: null, color, note: note.trim() || null, classId, studentId: studentCtx?.id ?? null, date: d, dayOfWeek: schoolDow(d)!, recurring: false });
      }
      if (items.length) { const r = await commit(items); if (!r.ok) return r; }
      if (newOnes.length) { const r = await addLessons(newOnes); if (!r.ok) return r; }
      if (calKind) for (const d of ds) {
        const e = await addCalendarEvent({ classId, kind: calKind, title: st, startDate: d, endDate: d });
        if (!e.ok) return e;
      }
      return { ok: true };
    }, `הוחלף בפעילות: ${st}${who}`);
  };

  const selectedClassName = classes.find((c) => c.id === classId)?.name ?? '';
  const row = 'flex items-start gap-3 border-b border-slate-100 px-4 py-3';
  const icon = 'mt-2 w-6 shrink-0 text-center text-lg text-slate-500';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label="עורך מערכת"
      className="m-0 h-[100dvh] max-h-none w-full max-w-none bg-white p-0 backdrop:bg-slate-900/40 md:m-auto md:h-auto md:max-h-[92vh] md:max-w-xl md:rounded-2xl md:shadow-2xl"
    >
      <div className="flex h-full flex-col md:max-h-[92vh]">
        {/* כותרת: ✕ מימין · שמירה משמאל */}
        <header className="safe-top flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
          <button type="button" aria-label="סגירה" onClick={() => ref.current?.close()}
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100">✕</button>
          <h2 className="flex-1 truncate text-lg font-semibold">{occ ? 'עריכת שיעור' : 'פעולה חדשה'} · {studentCtx ? studentCtx.full_name : selectedClassName}</h2>
          <button type="button" onClick={save} disabled={pending || !loaded}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50">
            {pending ? 'שומר…' : !loaded ? 'טוען…' : 'שמירה'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {studentCtx && (
            <div role="note" className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
              👤 <b>שינוי פרטני עבור: {studentCtx.full_name}</b> — גלוי לתלמיד, להוריו ולמורים המקצועיים הרלוונטיים.
              {!overridesReady && <span className="mt-1 block text-xs text-amber-800">{STUDENT_SQL_HINT} (הוספת שיעור אישי עובדת כבר עכשיו.)</span>}
            </div>
          )}
          {/* סוג הפעולה */}
          <div className="grid grid-cols-2 gap-1.5 border-b border-slate-100 p-3 sm:grid-cols-4" role="tablist" aria-label="סוג הפעולה">
            {ACTIONS.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={action === a.id}
                onClick={() => { setAction(a.id); setError(''); }}
                className={`rounded-xl border px-2 py-2 text-sm ${action === a.id ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 text-slate-600'}`}>
                <span className="me-1">{a.icon}</span>{a.label}
              </button>
            ))}
          </div>

          {/* כיתה */}
          <div className={row}>
            <span className={icon} aria-hidden>🏫</span>
            <div className="flex-1">
              <label className="label" htmlFor="ev-class">כיתה</label>
              <select id="ev-class" className="input" value={classId}
                onChange={(e) => { setClassId(e.target.value); setTargetId(''); setLessons([]); }}>
                {classes.map((c) => <option key={c.id} value={c.id}>כיתה {c.name}</option>)}
              </select>
            </div>
          </div>

          {/* ביטול: סוג */}
          {action === 'cancel' && (
            <div className={row}>
              <span className={icon} aria-hidden>🚫</span>
              <div className="flex-1">
                <span className="label">מה לבטל?</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['lesson', 'שיעור אחד'], ['day', 'כל היום'], ['early', 'שחרור מוקדם']] as const).map(([id, l]) => (
                    <button key={id} type="button" onClick={() => setCancelMode(id)}
                      className={`rounded-lg border px-2 py-2 text-sm ${cancelMode === id ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* פעילות מיוחדת */}
          {action === 'special' && (
            <div className={row}>
              <span className={icon} aria-hidden>✨</span>
              <div className="flex-1"><SpecialActivityPicker value={special} onChange={(v) => { setSpecial(v); setError(''); }} /></div>
            </div>
          )}

          {/* תאריך ושעות */}
          <div className={row}>
            <span className={icon} aria-hidden>🕒</span>
            <div className="flex-1 space-y-3">
              {(action === 'special' || (action === 'add' && !studentCtx)) && (
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="font-medium">כל היום</span>
                  <span className="relative inline-flex">
                    <input type="checkbox" role="switch" aria-label="כל היום" className="peer sr-only" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                    <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600" />
                    <span className="absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[-1.25rem]" />
                  </span>
                </label>
              )}
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div>
                  <label className="label" htmlFor="ev-sdate">{showEndDate ? 'מתאריך' : 'תאריך'}</label>
                  <input id="ev-sdate" type="date" className="input" value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
                </div>
                {showTime && (
                  <div>
                    <label className="label" htmlFor="ev-stime">שעת התחלה</label>
                    <input id="ev-stime" type="time" className="input" value={startTime}
                      onChange={(e) => { setStartTime(e.target.value); if (e.target.value && (!endTime || endTime <= e.target.value)) setEndTime(addMinutes(e.target.value, 45)); }} />
                  </div>
                )}
              </div>
              {(showEndDate || showTime) && (
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  {showEndDate ? (
                    <div>
                      <label className="label" htmlFor="ev-edate">עד תאריך</label>
                      <input id="ev-edate" type="date" className="input" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  ) : <div className="text-xs text-slate-500">{heDate(startDate, { weekday: 'long', day: 'numeric', month: 'long' })}</div>}
                  {showTime && (
                    <div>
                      <label className="label" htmlFor="ev-etime">שעת סיום</label>
                      <input id="ev-etime" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
              {action === 'cancel' && cancelMode === 'early' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <label className="label" htmlFor="ev-early">🔔 סיום מערכת לתלמידים בשעה</label>
                  <input id="ev-early" type="time" className="input w-36" value={earlyTime} onChange={(e) => setEarlyTime(e.target.value)} />
                  <p className="mt-1 text-xs text-amber-900">כל השיעורים מהשעה הזו ועד סוף היום יבוטלו, ותוצג הודעה: "{EARLY_DISMISSAL_PREFIX} {earlyTime}"</p>
                </div>
              )}
            </div>
          </div>

          {/* בחירת שיעור (שינוי / ביטול שיעור אחד) */}
          {needsTarget && (
            <div className={row}>
              <span className={icon} aria-hidden>📚</span>
              <div className="flex-1">
                <span className="label">איזה שיעור? ({heDate(startDate, { weekday: 'long' })})</span>
                {!loaded ? <p className="text-sm text-slate-400">טוען שיעורים…</p> : dayLessons.length === 0 ? <p className="text-sm text-slate-500">אין שיעורים בתאריך זה</p> : (
                  <div className="flex flex-wrap gap-1.5">
                    {dayLessons.map((l) => (
                      <button key={l.id} type="button" onClick={() => pickTarget(l)}
                        className={`rounded-lg border px-2 py-1 text-sm ${targetId === l.id ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>
                        <span dir="ltr" className="text-xs text-slate-500">{hhmm(l.start_time)}</span> {l.student_id ? '👤 ' : ''}{l.subject}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* שם השיעור ומורה */}
          {(action === 'add' || action === 'edit') && (
            <div className={row}>
              <span className={icon} aria-hidden>📝</span>
              <div className="flex-1 space-y-2">
                <div>
                  <label className="label" htmlFor="ev-title">שם השיעור / הפעילות</label>
                  <input id="ev-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: תגבור מתמטיקה" />
                </div>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <div>
                    <label className="label" htmlFor="ev-teacher">מורה</label>
                    <select id="ev-teacher" className="input" value={teacherSel} onChange={(e) => setTeacherSel(e.target.value)}>
                      <option value="">— ללא מורה —</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      <option value={OTHER}>אחר (מלל חופשי)…</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="ev-room">חדר</label>
                    <input id="ev-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
                  </div>
                </div>
                {teacherSel === OTHER && (
                  <input className="input" aria-label="שם המורה" placeholder="שם המורה / המדריך" value={teacherText} onChange={(e) => setTeacherText(e.target.value)} />
                )}
              </div>
            </div>
          )}

          {/* תדירות */}
          <div className={row}>
            <span className={icon} aria-hidden>🔁</span>
            <div className="flex-1">
              <label className="label" htmlFor="ev-freq">תדירות</label>
              <select id="ev-freq" className="input" value={freq} onChange={(e) => setFreq(e.target.value as EditScope)}>
                {FREQS.filter((f) => allowed.includes(f.id)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* צבע */}
          {action !== 'cancel' && !(action === 'add' && allDay) && (
            <div className={row}>
              <span className={icon} aria-hidden>🎨</span>
              <div className="flex-1">
                <span className="label">צבע תצוגה</span>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="צבע תצוגה">
                  <button type="button" role="radio" aria-checked={!color} aria-label="ללא צבע" onClick={() => setColor(null)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-white text-xs text-slate-400 ${!color ? 'border-slate-800' : 'border-slate-200'}`}>∅</button>
                  {COLORS.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={color === c.id} aria-label={c.label} title={c.label}
                      onClick={() => setColor(c.id)}
                      className={`h-8 w-8 rounded-full ${c.dot} ring-offset-2 ${color === c.id ? 'ring-2 ring-slate-800' : ''}`} />
                  ))}
                </div>
                {!dbSupportsExtras() && <p className="mt-1 text-xs text-amber-700">הצבע וההערה הקבועה יישמרו לאחר הרצת קובץ ה-SQL (גרסה 1.3.0).</p>}
              </div>
            </div>
          )}

          {/* תיאור */}
          <div className={row}>
            <span className={icon} aria-hidden>💬</span>
            <div className="flex-1">
              <label className="label" htmlFor="ev-note">{action === 'cancel' ? 'סיבה / הודעה לתלמידים ולהורים' : 'הוספת תיאור / הערה לתלמידים ולהורים'}</label>
              <textarea id="ev-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {error && <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="h-8" />
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="אישור הסרה" message={confirm.text} confirmLabel="הסרה" danger pending={pending}
          onCancel={() => setConfirm(null)} onConfirm={() => { const r = confirm.run; setConfirm(null); r(); }} />
      )}
    </dialog>
  );
}
