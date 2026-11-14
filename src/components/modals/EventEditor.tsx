'use client';

/**
 * עורך שיעור/אירוע במסך מלא — בהשראת Google Calendar במובייל.
 * כותרת: ✕ (ימין) · שמירה (שמאל).
 * פעולות: הוספת שיעור · שינוי שיעור · ביטול / שחרור מוקדם · פעילות מיוחדת.
 * תדירות: חד-פעמי · רק השבוע הנוכחי · כל ימי השבוע (א'-ה') · חוזר כל שבוע עד סוף השנה.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addCalendarEvent, addCalendarEventFull, addLessons, commitChanges, schoolYearEnd, dbSupportsExtras, endLesson, endLessons, fetchClassLessons,
  fetchClassPersonalLessons, fetchClassStudents,
  updateLessonPermanent, updateLessonsPartial, type ChangeRow, type LessonFields, type Result,
} from '@/lib/api';
import { STUDENT_SQL_HINT, supportsStudentOverrides } from '@/lib/schema';
import { addDays, addMinutes, heDate, hhmm, schoolDow, weekDates } from '@/lib/dates';
import { COLORS } from '@/lib/colors';
import type { EditScope, Lesson, LessonChangeKind, Occurrence, Person } from '@/lib/types';
import { EARLY_DISMISSAL_PREFIX, SPECIAL_NOTE, isSpecialNote, specialDetail } from '@/lib/types';
import SpecialActivityPicker, { specialCalendarKind, specialTitle, type SpecialValue } from '../schedule/SpecialActivityPicker';
import ConfirmDialog from '../ui/ConfirmDialog';
import AudiencePicker, { type Audience } from '../schedule/AudiencePicker';

type Action = 'add' | 'edit' | 'cancel' | 'special';
type CancelMode = 'lesson' | 'day' | 'early';

const ACTIONS: { id: Action; label: string; icon: string }[] = [
  { id: 'add', label: 'הוספת שיעור', icon: '➕' },
  { id: 'edit', label: 'שינוי שיעור', icon: '✏️' },
  { id: 'cancel', label: 'ביטול / מחיקה / סיום יום', icon: '🗑️' },
  { id: 'special', label: 'פעילות מיוחדת', icon: '✨' },
];

const FREQS: { id: EditScope; label: string }[] = [
  { id: 'once', label: 'חד-פעמי (רק בתאריך שנבחר)' },
  { id: 'week', label: 'רק השבוע הנוכחי' },
  { id: 'allDays', label: "כל ימי השבוע (א'-ה') באותה שעה" },
  { id: 'until', label: 'חוזר כל שבוע עד תאריך…' },
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
  classes, initialClassId, teachers, students = [], date, occurrence, student = null, initialAction, initialRemove = false, onClose, onSaved,
}: {
  classes: { id: string; name: string }[];
  initialClassId: string;
  teachers: Person[];
  date: string;
  occurrence?: Occurrence | null;
  /** פתיחה ישירה בפעולה מסוימת (למשל "🗑️ מחק שיעור") */
  initialAction?: Action;
  /** פתיחה במצב מחיקה מלאה */
  initialRemove?: boolean;
  /** תלמידי הכיתה הנוכחית (לבורר קהל היעד) */
  students?: Person[];
  /** תלמיד מוצג בתפריט העליון — מסומן מראש בבורר */
  student?: Person | null;
  onClose: () => void;
  onSaved: (msg: string, where: EditorSaved) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);

  const occ = occurrence ?? null;
  const [classId, setClassId] = useState(initialClassId);
  const [action, setAction] = useState<Action>(initialAction ?? (occ ? 'edit' : 'add'));
  /** ביטול (מוצג כמבוטל) או מחיקה (השיעור נעלם מהמערכת) */
  const [removeMode, setRemoveMode] = useState(initialRemove);
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
  /** "חוזר כל שבוע עד תאריך": התאריך האחרון (כולל). ברירת מחדל — סוף שנת הלימודים */
  const [untilDate, setUntilDate] = useState(() => schoolYearEnd(occ?.date ?? date));
  /** "כל היום" בהוספה: סוג האירוע בלוח */
  const [dayKind, setDayKind] = useState<'event' | 'holiday' | 'trip'>('event');
  const [color, setColor] = useState<string | null>(occ?.change?.new_color ?? occ?.lesson.color ?? null);
  const [note, setNote] = useState(occ ? (isSpecialNote(occ.change?.note) ? specialDetail(occ.change?.note) : occ.change?.note ?? occ.lesson.note ?? '') : '');
  const [special, setSpecial] = useState<SpecialValue>({ preset: 'trip', text: '' });
  const [cancelMode, setCancelMode] = useState<CancelMode>('lesson');
  const [earlyTime, setEarlyTime] = useState('12:55');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  // ---- קהל יעד: כל הכיתה / תלמידים נבחרים (בתצוגת תלמיד — הוא מסומן מראש)
  const [audience, setAudience] = useState<Audience>(student ? 'students' : 'class');
  const [picked, setPicked] = useState<string[]>(student ? [student.id] : []);
  const [classStudents, setClassStudents] = useState<{ id: string; full_name: string }[]>(classId === initialClassId ? students : []);
  useEffect(() => {
    if (classId === initialClassId && students.length) { setClassStudents(students); return; }
    let alive = true;
    fetchClassStudents(classId).then((l) => { if (alive) setClassStudents(l); });
    return () => { alive = false; };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string) => classStudents.find((x) => x.id === id)?.full_name ?? 'תלמיד/ה';
  const [overridesReady, setOverridesReady] = useState(true);
  useEffect(() => { if (audience === 'students') supportsStudentOverrides().then(setOverridesReady); }, [audience]);

  // טעינת שיעורי הכיתה + כל השיעורים האישיים בכיתה. השמירה נחסמת עד הטעינה.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = loadedFor === classId;
  useEffect(() => {
    let alive = true;
    setLoadedFor(null);
    Promise.all([fetchClassLessons(classId), fetchClassPersonalLessons(classId)])
      .then(([cls, personal]) => {
        if (!alive) return;
        // איחוד לפי מזהה — הגנה מכפילויות
        const all = [...new Map([...cls, ...personal].map((l) => [l.id, l])).values()];
        setLessons(all.length ? all : occ && occ.lesson.class_id === classId ? [occ.lesson] : []);
        setLoadedFor(classId);
      })
      .catch(() => { if (alive) setError('טעינת שיעורי הכיתה נכשלה — בדקו את החיבור'); });
    return () => { alive = false; };
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = lessons.find((l) => l.id === targetId) ?? null;
  /** עריכת שיעור אישי/קבוצתי קיים: השינוי חל על השיעור עצמו (ולכל חברי הקבוצה) — בלי בורר קהל */
  const personalTarget = !!target?.student_id && (action === 'edit' || (action === 'cancel' && cancelMode === 'lesson'));
  const groupLessons: Lesson[] = personalTarget
    ? (occ?.groupLessons?.some((g) => g.lesson.id === target!.id) ? occ.groupLessons.map((g) => g.lesson) : [target!])
    : [];
  const audienceIds: (string | null)[] = personalTarget || audience === 'class' ? [null] : picked;
  const forStudents = audience === 'students' && !personalTarget;

  /** שיעורים רלוונטיים לתלמיד (כיתתיים + האישיים שלו) / לכיתה (כיתתיים בלבד) */
  const relevantFor = (sid: string | null) => (l: Lesson) => !l.student_id || (!!sid && l.student_id === sid);
  const pickerSids = audience === 'students' ? picked : [];
  const dayLessons = useMemo(() => lessons.filter((l) => activeOn(l, startDate) && (!l.student_id || pickerSids.includes(l.student_id) || l.id === targetId))
    .sort((a, b) => a.start_time.localeCompare(b.start_time)), [lessons, startDate, pickerSids.join(), targetId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    action === 'add' ? (allDay ? ['once'] : ['once', 'week', 'allDays', 'until', 'year'])
    : action === 'edit' ? (target?.specific_date ? ['once', 'year'] : ['once', 'week', 'allDays', 'until', 'year'])
    : action === 'cancel' ? (cancelMode === 'lesson' ? (target?.specific_date ? ['once', 'year'] : ['once', 'week', 'allDays', 'until', 'year']) : ['once', 'week'])
    : ['once', 'week'];
  useEffect(() => { if (!allowed.includes(freq)) setFreq(allowed[0]); }, [allowed.join(), freq]); // eslint-disable-line react-hooks/exhaustive-deps
  // "כל היום" בהוספה = אירוע לוח לכל הכיתה — לא זמין לתלמידים נבחרים
  useEffect(() => { if (forStudents && action === 'add' && allDay) setAllDay(false); }, [forStudents, action, allDay]);

  const needsTarget = action === 'edit' || (action === 'cancel' && cancelMode === 'lesson');
  const showTime = action === 'add' ? !allDay : action === 'edit' ? true : action === 'special' ? !allDay : false;
  const showEndDate = freq === 'once' && (action === 'add' ? allDay : action === 'special' || (action === 'cancel' && cancelMode !== 'lesson'));

  const teacherId = teacherSel && teacherSel !== OTHER ? teacherSel : null;
  const teacherLabel = teacherSel === OTHER ? teacherText.trim() || null : null;

  /** תאריכים שהפעולה חלה עליהם (חד-פעמי: טווח; השבוע: א'-ה' של שבוע תאריך ההתחלה) */
  const dates = () => (freq === 'week' ? weekDates(startDate) : schoolDaysBetween(startDate, showEndDate ? endDate : startDate));
  /** אותה משבצת שעה בכל ימי השבוע (כיתתי, או של אותו תלמיד אם השיעור אישי) */
  /** כל המופעים השבועיים של שיעור בטווח [from, to] (כולל) */
  const weeklyDates = (l: Lesson, from: string, to: string) => {
    const out: string[] = [];
    for (let d = from; d <= to && out.length < 60; d = addDays(d, 1)) if (activeOn(l, d)) out.push(d);
    return out;
  };
  const slotOf = (l: Lesson) => lessons.filter((x) => (x.student_id ?? null) === (l.student_id ?? null) && !x.specific_date && x.start_time === l.start_time);
  const whoText = personalTarget
    ? (groupLessons.length > 1 ? ` ל-${groupLessons.length} תלמידים` : ` עבור ${nameOf(target!.student_id!)}`)
    : forStudents ? (picked.length === 1 ? ` עבור ${nameOf(picked[0])}` : ` עבור ${picked.length} תלמידים`) : '';

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
  /** מריץ את אותה פעולה לכל אחד מקהל היעד (null = כל הכיתה) */
  const forEachAudience = (fn: (sid: string | null) => Promise<Result>) => async (): Promise<Result> => {
    for (const sid of audienceIds) { const r = await fn(sid); if (!r.ok) return r; }
    return { ok: true };
  };

  const fieldsForAdd = (): LessonFields => ({
    subject: title, teacher_id: teacherId, co_teacher_id: null, teacher_label: teacherLabel,
    start_time: startTime, end_time: endTime, room, color, note,
  });

  // ------------------------------------------------------------- שמירה
  const save = () => {
    setError('');
    if (!loaded) { setError('רגע — שיעורי הכיתה עדיין נטענים'); return; }
    if (forStudents && !picked.length) { setError('סמנו לפחות תלמיד אחד (או בחרו "כל הכיתה")'); return; }
    if (!schoolDow(startDate)) { setError('יש לבחור יום לימודים (א׳–ה׳)'); return; }
    if (showEndDate && endDate < startDate) { setError('תאריך הסיום לפני תאריך ההתחלה'); return; }
    if (showTime && endTime <= startTime) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    if (needsTarget && !target) { setError('בחרו שיעור מהרשימה'); return; }
    if (freq === 'until' && (!untilDate || untilDate < startDate)) { setError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה'); return; }

    // ---- הוספה (תלמידים נבחרים: שיעור אישי לכל אחד מהם)
    if (action === 'add') {
      if (!title.trim()) { setError('יש להזין שם לשיעור / לפעילות'); return; }
      if (allDay) {
        return run(() => addCalendarEventFull(classId, { kind: dayKind, title, startDate, endDate: endDate < startDate ? startDate : endDate, note }),
          `נוסף ${dayKind === 'holiday' ? 'יום חופשה' : 'אירוע'}: ${title.trim()}`);
      }
      const rows = audienceIds.flatMap((sid) => {
        const f = { ...fieldsForAdd(), classId, studentId: sid };
        return freq === 'once' ? dates().map((d) => ({ ...f, date: d, dayOfWeek: schoolDow(d)!, recurring: false }))
          : freq === 'week' ? weekDates(startDate).map((d) => ({ ...f, date: d, dayOfWeek: schoolDow(d)!, recurring: false }))
          : freq === 'allDays' ? weekDates(startDate).map((d) => ({ ...f, date: startDate, dayOfWeek: schoolDow(d)!, recurring: true }))
          : freq === 'until' ? [{ ...f, date: startDate, dayOfWeek: schoolDow(startDate)!, recurring: true, validTo: untilDate }]
          : [{ ...f, date: startDate, dayOfWeek: schoolDow(startDate)!, recurring: true }];
      });
      return run(() => addLessons(rows), `נוסף: ${title.trim()}${whoText}`);
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
      const bases = personalTarget ? groupLessons : [t];
      const isOverride = forStudents && !t.student_id;
      if (freq === 'once' || freq === 'week' || freq === 'until' || isOverride) {
        if (changed.teacher && teacherLabel && !teacherId) { setError('בשינוי לתאריך / לתלמידים יש לבחור מורה מהרשימה'); return; }
        const itemsFor = () => bases.flatMap((b) =>
          freq === 'once' ? (activeOn(b, startDate) ? [{ lesson: b, row: row(b.id, startDate) }] : [])
          : freq === 'week' ? weekDates(startDate).flatMap((d) => slotOf(b).filter((l) => activeOn(l, d)).map((l) => ({ lesson: l, row: row(l.id, d) })))
          // עד תאריך: לתלמידים — דריסה חוזרת עד התאריך; לכיתה — שינוי לכל מופע שבועי בטווח
          : freq === 'until' ? (isOverride ? [{ lesson: b, row: row(b.id, startDate), until: untilDate }]
            : weeklyDates(b, startDate, untilDate).map((d) => ({ lesson: b, row: row(b.id, d) })))
          // תלמידים + קבוע: דריסה פרטנית שחוזרת כל שבוע עד סוף השנה
          : freq === 'allDays' ? slotOf(b).map((l) => ({ lesson: l, row: row(l.id, startDate), recurring: true }))
          : [{ lesson: b, row: row(b.id, startDate), recurring: true }]);
        const items = itemsFor();
        if (!items.length) { setError('השיעור לא מתקיים בתאריך שנבחר'); return; }
        return run(forEachAudience((sid) => commitChanges(sid, items)),
          (freq === 'week' ? 'השינוי נשמר לכל השבוע' : freq === 'once' ? 'השינוי נשמר' : freq === 'until' ? `השינוי נשמר עד ${heDate(untilDate, { day: 'numeric', month: 'numeric', year: '2-digit' })}` : 'השינוי נשמר עד סוף השנה') + whoText);
      }
      const full: LessonFields = {
        subject: title, teacher_id: teacherId, co_teacher_id: t.co_teacher_id, teacher_label: teacherLabel,
        start_time: startTime, end_time: endTime, room, color, note,
      };
      if (freq === 'year') {
        return run(async () => {
          for (const b of bases) { const r = await updateLessonPermanent(b.id, { ...full, co_teacher_id: b.co_teacher_id }); if (!r.ok) return r; }
          return { ok: true };
        }, 'המערכת הקבועה עודכנה' + whoText);
      }
      const patch: Partial<LessonFields> = {};
      if (changed.subject) patch.subject = title.trim();
      if (changed.teacher) { patch.teacher_id = teacherId; patch.teacher_label = teacherLabel; }
      if (changed.time) { patch.start_time = startTime; patch.end_time = endTime; }
      if (changed.room) patch.room = room.trim() || null;
      if (changed.color) patch.color = color;
      if ((note.trim() || null) !== (t.note || null)) patch.note = note.trim() || null;
      if (!Object.keys(patch).length) { setError('לא בוצע שינוי'); return; }
      return run(() => updateLessonsPartial([...new Set(bases.flatMap((b) => slotOf(b).map((l) => l.id)))], patch),
        `עודכנה המשבצת ${hhmm(t.start_time)} בכל ימי השבוע${whoText}`);
    }

    // ---- ביטול / שחרור מוקדם
    if (action === 'cancel') {
      const reason = note.trim() || null;
      // מחיקה = 'removed' (השיעור לא קיים בתצוגה); ביטול = 'cancelled' (מוצג עם קו חוצה)
      const cancelRow = (l: Lesson, d: string, n: string | null = reason, kind: 'cancelled' | 'removed' = removeMode ? 'removed' : 'cancelled'): ChangeRow => ({ lesson_id: l.id, change_date: d, kind, note: n });
      const verb = removeMode ? 'נמחק' : 'בוטל';
      if (cancelMode === 'lesson' && target) {
        const bases = personalTarget ? groupLessons : [target];
        const isOverride = forStudents && !target.student_id;
        if (freq === 'year' || freq === 'allDays') {
          const list = [...new Set(bases.flatMap((b) => (freq === 'year' ? [b] : slotOf(b))))];
          const subj = freq === 'year' ? `"${target.subject}"` : `כל שיעורי המשבצת ${hhmm(target.start_time)}`;
          const text = isOverride
            ? `${removeMode ? 'למחוק' : 'לבטל'} את ${subj}${whoText} בלבד, בכל שבוע עד סוף השנה? שאר הכיתה ממשיכה כרגיל.`
            : `להסיר את ${subj}${whoText} מהמערכת הקבועה החל מ-${heDate(startDate, { day: 'numeric', month: 'numeric' })}?`;
          setConfirm({ text, run: () => run(
            isOverride
              ? forEachAudience((sid) => commitChanges(sid, list.map((l) => ({ lesson: l, row: cancelRow(l, startDate), recurring: true }))))
              : async () => {
                const oneTime = list.filter((l) => l.specific_date);
                for (const l of oneTime) { const r = await endLesson(l.id, startDate, true); if (!r.ok) return r; }
                const rest = list.filter((l) => !l.specific_date);
                return rest.length ? endLessons(rest.map((l) => l.id), startDate) : { ok: true };
              },
            (isOverride ? `${verb}${whoText} עד סוף השנה` : `הוסר מהמערכת${whoText}`)) });
          return;
        }
        const items = bases.flatMap((b) => (freq === 'once' ? [{ lesson: b, row: cancelRow(b, startDate) }]
          : freq === 'until' ? (isOverride ? [{ lesson: b, row: cancelRow(b, startDate), until: untilDate }]
            : weeklyDates(b, startDate, untilDate).map((d) => ({ lesson: b, row: cancelRow(b, d) })))
          : weekDates(startDate).flatMap((d) => slotOf(b).filter((l) => activeOn(l, d)).map((l) => ({ lesson: l, row: cancelRow(l, d) })))));
        if (!items.length) { setError('השיעור לא מתקיים בטווח שנבחר'); return; }
        return run(forEachAudience((sid) => commitChanges(sid, items)), `השיעור ${verb}${freq === 'week' ? ' לכל השבוע' : freq === 'until' ? ` עד ${heDate(untilDate, { day: 'numeric', month: 'numeric', year: '2-digit' })}` : ''}${whoText}`);
      }
      const ds = dates();
      if (cancelMode === 'day') {
        const itemsFor = (sid: string | null) => ds.flatMap((d) => lessons.filter((l) => relevantFor(sid)(l) && activeOn(l, d)).map((l) => ({ lesson: l, row: cancelRow(l, d) })));
        if (!audienceIds.some((sid) => itemsFor(sid).length)) { setError('אין שיעורים לבטל בתאריכים שנבחרו'); return; }
        return run(forEachAudience((sid) => { const it = itemsFor(sid); return it.length ? commitChanges(sid, it) : Promise.resolve({ ok: true } as Result); }),
          `השיעורים ${removeMode ? 'נמחקו' : 'בוטלו'}${whoText}`);
      }
      // שחרור מוקדם: ביטול כל השיעורים מהשעה שנבחרה + הודעה (לכל הכיתה — גם אירוע בלוח)
      const msg = `${EARLY_DISMISSAL_PREFIX} ${earlyTime}`;
      return run(async () => {
        const r = await forEachAudience((sid) => {
          const items = ds.flatMap((d) => lessons.filter((l) => relevantFor(sid)(l) && activeOn(l, d) && hhmm(l.start_time) >= earlyTime)
            .map((l) => ({ lesson: l, row: cancelRow(l, d, reason ? `${msg} — ${reason}` : msg, 'removed') })));
          return items.length ? commitChanges(sid, items) : Promise.resolve({ ok: true } as Result);
        })();
        if (!r.ok) return r;
        if (!forStudents) for (const d of ds) {
          const e = await addCalendarEvent({ classId, kind: 'event', title: reason ? `${msg} — ${reason}` : msg, startDate: d, endDate: d });
          if (!e.ok) return e;
        }
        return { ok: true };
      }, msg + whoText);
    }

    // ---- פעילות מיוחדת: מחליפה את השיעורים בטווח השעות (או כל היום)
    const st = specialTitle(special);
    if (!st) { setError('כתבו מהי הפעילות או הסיבה'); return; }
    const marker = note.trim() ? `${SPECIAL_NOTE}: ${note.trim()}` : SPECIAL_NOTE;
    const calKind = forStudents ? null : specialCalendarKind(special) ?? (allDay ? 'event' : null);
    return run(async () => {
      const ds = dates();
      const r = await forEachAudience(async (sid) => {
        const items: { lesson: Lesson; row: ChangeRow }[] = [];
        const newOnes: Parameters<typeof addLessons>[0] = [];
        for (const d of ds) {
          const hit = lessons.filter((l) => relevantFor(sid)(l) && activeOn(l, d) && (allDay || overlaps(l, startTime, endTime)));
          if (hit.length) hit.forEach((l) => items.push({ lesson: l, row: { lesson_id: l.id, change_date: d, kind: 'modified', new_subject: st, new_color: color, note: marker } }));
          else if (!allDay) newOnes.push({ subject: st, teacher_id: null, co_teacher_id: null, teacher_label: null, start_time: startTime, end_time: endTime, room: null, color, note: note.trim() || null, classId, studentId: sid, date: d, dayOfWeek: schoolDow(d)!, recurring: false });
        }
        if (items.length) { const a = await commitChanges(sid, items); if (!a.ok) return a; }
        if (newOnes.length) { const a = await addLessons(newOnes); if (!a.ok) return a; }
        return { ok: true };
      })();
      if (!r.ok) return r;
      if (calKind) for (const d of ds) {
        const e = await addCalendarEvent({ classId, kind: calKind, title: st, startDate: d, endDate: d });
        if (!e.ok) return e;
      }
      return { ok: true };
    }, `הוחלף בפעילות: ${st}${whoText}`);
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
          <h2 className="flex-1 truncate text-lg font-semibold">{occ ? 'עריכת שיעור' : 'פעולה חדשה'} · {forStudents ? (picked.length === 1 ? nameOf(picked[0]) : `${picked.length} תלמידים`) : selectedClassName}</h2>
          <button type="button" onClick={save} disabled={pending || !loaded}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50">
            {pending ? 'שומר…' : !loaded ? 'טוען…' : 'שמירה'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {(forStudents || personalTarget) && (
            <div role="note" className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
              👤 <b>{personalTarget ? (groupLessons.length > 1 ? `שיעור קבוצתי: ${groupLessons.length} תלמידים` : `שיעור אישי של ${nameOf(target!.student_id!)}`)
                : `שינוי ${picked.length > 1 ? 'קבוצתי' : 'פרטני'} עבור: ${picked.length ? picked.map(nameOf).join(', ') : '— טרם נבחרו תלמידים —'}`}</b>
              {' '}— גלוי {picked.length > 1 || groupLessons.length > 1 ? 'לתלמידים שנבחרו, להוריהם' : 'לתלמיד, להוריו'} ולמורים המקצועיים הרלוונטיים. שאר הכיתה ממשיכה כרגיל.
              {forStudents && !overridesReady && <span className="mt-1 block text-xs text-amber-800">{STUDENT_SQL_HINT} (הוספת שיעור אישי עובדת כבר עכשיו.)</span>}
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

          {/* קהל יעד */}
          {!personalTarget && !(action === 'add' && allDay) && (
            <div className={row}>
              <span className={icon} aria-hidden>🎯</span>
              <div className="flex-1">
                <span className="label">על מי חל השינוי?</span>
                <AudiencePicker audience={audience} onAudience={(a) => { setAudience(a); setError(''); }}
                  students={classStudents} selected={picked} onSelected={(ids) => { setPicked(ids); setError(''); }} />
              </div>
            </div>
          )}

          {/* ביטול: סוג */}
          {action === 'cancel' && (
            <div className={row}>
              <span className={icon} aria-hidden>🚫</span>
              <div className="flex-1">
                <span className="label">מה לבטל?</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['lesson', 'שיעור אחד'], ['day', 'כל היום'], ['early', 'סיום יום']] as const).map(([id, l]) => (
                    <button key={id} type="button" onClick={() => setCancelMode(id)}
                      className={`rounded-lg border px-2 py-2 text-sm ${cancelMode === id ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>{l}</button>
                  ))}
                </div>
                {cancelMode !== 'early' && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="אופן">
                    <button type="button" role="radio" aria-checked={!removeMode} onClick={() => setRemoveMode(false)}
                      className={`rounded-lg border px-2 py-2 text-sm ${!removeMode ? 'border-amber-500 bg-amber-50 font-medium' : 'border-slate-200'}`}>
                      🚫 ביטול<span className="block text-[11px] text-slate-500">יוצג כ"בוטל"</span>
                    </button>
                    <button type="button" role="radio" aria-checked={removeMode} onClick={() => setRemoveMode(true)}
                      className={`rounded-lg border px-2 py-2 text-sm ${removeMode ? 'border-red-500 bg-red-50 font-medium text-red-800' : 'border-slate-200'}`}>
                      🗑️ מחיקה<span className="block text-[11px] text-slate-500">השיעור ייעלם מהמערכת</span>
                    </button>
                  </div>
                )}
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
              {action === 'add' && allDay && (
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="סוג האירוע">
                  {([['event', '📌 אירוע'], ['holiday', '🏖️ חופשה'], ['trip', '🚌 טיול']] as const).map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={dayKind === k} onClick={() => setDayKind(k)}
                      className={`rounded-lg border px-2 py-1.5 text-sm ${dayKind === k ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>{l}</button>
                  ))}
                </div>
              )}
              {(action === 'special' || (action === 'add' && !forStudents)) && (
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
                  <label className="label" htmlFor="ev-early">🔔 מתי המערכת מסתיימת לתלמידים?</label>
                  <input id="ev-early" type="time" className="input w-36" value={earlyTime} onChange={(e) => setEarlyTime(e.target.value)} />
                  <p className="mt-1 text-xs text-amber-900">כל השיעורים מהשעה הזו ועד סוף היום יוסרו{forStudents ? ' לתלמידים שנבחרו' : ''}, ותוצג לתלמידים ולהורים הודעה: "{EARLY_DISMISSAL_PREFIX} {earlyTime}"</p>
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
                        <span dir="ltr" className="text-xs text-slate-500">{hhmm(l.start_time)}</span> {l.subject}{l.student_id ? <span className="text-xs text-violet-700"> · 👤 {nameOf(l.student_id)}</span> : ''}
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
              {freq === 'until' && (
                <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                  <label className="label" htmlFor="ev-until">📅 תאריך אחרון / סיום חזרה</label>
                  <input id="ev-until" type="date" className="input w-48" min={startDate} value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
                  <p className="mt-1 text-xs text-slate-600">
                    כל שבוע מ-{heDate(startDate, { day: 'numeric', month: 'numeric' })} ועד {heDate(untilDate, { day: 'numeric', month: 'numeric', year: 'numeric' })} (כולל). אחר כך — חזרה למערכת הרגילה.
                  </p>
                </div>
              )}
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
