import { addDays, schoolDow } from './dates';
import type { Assignment, CalendarEvent, Lesson, LessonChange, Occurrence, StudentChange, StudentEvent } from './types';
import { cleanNote, isDayEndNotice, isRemovedChange } from './types';

/** "צופיה / הדסה", או תווית חופשית, או ריק */
export function lessonTeacherName(l: Lesson) {
  if (l.teacher_label) return l.teacher_label;
  return [l.teacher?.full_name, l.co_teacher?.full_name].filter(Boolean).join(' / ');
}

/**
 * תצוגה כיתתית לצוות: שיעורים אישיים זהים (אותו תאריך, שעות, מקצוע ומורה) לכמה תלמידים
 * מקובצים לכרטיס אחד עם רשימת התלמידים.
 */
export function groupPersonal(occs: Occurrence[], nameOf: (id: string) => string): Occurrence[] {
  const out: Occurrence[] = [];
  const groups = new Map<string, Occurrence>();
  for (const o of occs) {
    if (!o.personal || !o.lesson.student_id) { out.push(o); continue; }
    const key = [o.date, o.start, o.end, o.subject, o.teacherId ?? '', o.status].join('|');
    const g = groups.get(key);
    const entry = { lesson: o.lesson, name: nameOf(o.lesson.student_id) };
    if (g) g.groupLessons!.push(entry);
    else { const first = { ...o, groupLessons: [entry] }; groups.set(key, first); out.push(first); }
  }
  return out;
}

/**
 * הודעות "סיום יום לימודים בשעה …" שנובעות משינויים פרטניים (לתלמיד/הורה) —
 * כאירועי לוח מדומים, בלי כפילות עם הודעה כיתתית קיימת.
 */
export function personalDayNotices(occs: Occurrence[], calendar: CalendarEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const seen = new Set(calendar.map((e) => `${e.start_date}|${e.title}`));
  for (const o of occs) {
    if (!o.personalOverride || !isDayEndNotice(o.changeNote)) continue;
    const title = o.changeNote!.split(' — ')[0];
    if (seen.has(`${o.date}|${title}`) || calendar.some((e) => e.start_date <= o.date && e.end_date >= o.date && e.title.startsWith(title))) continue;
    seen.add(`${o.date}|${title}`);
    out.push({ id: `notice-${o.date}`, class_id: null, kind: 'event', title, start_date: o.date, end_date: o.date });
  }
  return out;
}

export function holidayOn(date: string, events: CalendarEvent[]) {
  return events.find((e) => e.kind === 'holiday' && e.start_date <= date && e.end_date >= date) ?? null;
}

/**
 * הופך את התבנית השבועית (lessons) למופעים קונקרטיים בטווח התאריכים,
 * ומחיל: חופשות, ביטולים, מחליפים, הזזות, החלפת חדר, ושיעורים חד-פעמיים.
 */
export function buildOccurrences(args: {
  from: string;
  to: string;
  lessons: Lesson[];
  changes: LessonChange[];
  calendar: CalendarEvent[];
  assignments: Assignment[];
  events: StudentEvent[];
  /** דריסות פרטניות (מיגרציה 0005) */
  studentChanges?: StudentChange[];
  /** התלמיד המוצג — הדריסות שלו גוברות על שינויי הכיתה */
  studentId?: string | null;
}): Occurrence[] {
  const { from, to, lessons, changes, calendar, assignments, events, studentChanges = [], studentId = null } = args;
  const changeMap = new Map(changes.map((c) => [`${c.lesson_id}|${c.change_date}`, c]));
  // דריסה חלה בתאריך: מדויקת, או חוזרת (change_date ≤ d ≤ until_date). מדויקת גוברת.
  const overridesOn = (lessonId: string, d: string) => {
    const list = studentChanges.filter((c) => c.lesson_id === lessonId &&
      (c.change_date === d || (c.until_date && c.change_date <= d && d <= c.until_date)));
    const byStudent = new Map<string, StudentChange>();
    for (const c of list) {
      const prev = byStudent.get(c.student_id);
      if (!prev || (c.change_date === d && prev.change_date !== d)) byStudent.set(c.student_id, c);
    }
    return [...byStudent.values()];
  };
  const out: Occurrence[] = [];

  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dow = schoolDow(date);
    if (dow === null || holidayOn(date, calendar)) continue;

    for (const lesson of lessons) {
      if (lesson.day_of_week !== dow) continue;
      if (lesson.specific_date ? lesson.specific_date !== date : false) continue;
      if (lesson.valid_from && date < lesson.valid_from) continue;
      if (lesson.valid_to && date > lesson.valid_to) continue;

      const key = `${lesson.id}|${date}`;
      const overrides = overridesOn(lesson.id, date);
      const mine = studentId ? overrides.find((c) => c.student_id === studentId) ?? null : null;
      const change: LessonChange | undefined = mine ?? changeMap.get(key);
      const isSub = (change?.kind === 'substitute' || change?.kind === 'modified') && !!change.substitute_teacher_id;
      out.push({
        key,
        date,
        lesson,
        subject: change?.new_subject || lesson.subject,
        change: change ?? null,
        start: change?.new_start_time ?? lesson.start_time,
        end: change?.new_end_time ?? lesson.end_time,
        room: change?.new_room ?? lesson.room,
        teacherId: isSub ? change!.substitute_teacher_id : lesson.teacher_id,
        teacherName: isSub ? change!.substitute?.full_name ?? '' : lessonTeacherName(lesson),
        status: change ? (isRemovedChange(change) ? 'removed' : change.kind) : 'normal',
        changeNote: cleanNote(change?.note),
        personal: lesson.student_id !== null,
        personalOverride: !!mine,
        studentOverrides: studentId ? [] : overrides,
        assignments: assignments.filter((a) => a.lesson_id === lesson.id && a.due_date === date),
        events: events.filter((e) => e.lesson_id === lesson.id && e.lesson_date === date),
      });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
