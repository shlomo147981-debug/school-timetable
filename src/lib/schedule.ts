import { addDays, schoolDow } from './dates';
import type { Assignment, CalendarEvent, Lesson, LessonChange, Occurrence, StudentEvent } from './types';

/** "צופיה / הדסה", או תווית חופשית, או ריק */
export function lessonTeacherName(l: Lesson) {
  if (l.teacher_label) return l.teacher_label;
  return [l.teacher?.full_name, l.co_teacher?.full_name].filter(Boolean).join(' / ');
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
}): Occurrence[] {
  const { from, to, lessons, changes, calendar, assignments, events } = args;
  const changeMap = new Map(changes.map((c) => [`${c.lesson_id}|${c.change_date}`, c]));
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
      const change = changeMap.get(key);
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
        status: change?.kind ?? 'normal',
        changeNote: change?.note ?? null,
        personal: lesson.student_id !== null,
        assignments: assignments.filter((a) => a.lesson_id === lesson.id && a.due_date === date),
        events: events.filter((e) => e.lesson_id === lesson.id && e.lesson_date === date),
      });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
