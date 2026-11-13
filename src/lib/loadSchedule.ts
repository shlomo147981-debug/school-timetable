import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment, CalendarEvent, Lesson, LessonChange, StudentChange, StudentEvent } from './types';
import { supportsStudentOverrides } from './schema';
import type { Scope } from './context';

export async function loadSchedule(
  supabase: SupabaseClient,
  opts: { classId: string; studentId: string | null; scope: Scope; from: string; to: string },
) {
  const { classId, studentId, scope, from, to } = opts;

  let lessonsQ = supabase
    .from('lessons')
    .select('*, teacher:profiles!lessons_teacher_id_fkey(full_name), co_teacher:profiles!lessons_co_teacher_id_fkey(full_name)')
    .eq('class_id', classId);
  lessonsQ =
    studentId && scope === 'personal'
      ? lessonsQ.or(`student_id.is.null,student_id.eq.${studentId}`)
      : lessonsQ.is('student_id', null);

  const [lessonsRes, calRes, asgRes, evRes] = await Promise.all([
    lessonsQ,
    supabase
      .from('calendar_events').select('*')
      .or(`class_id.is.null,class_id.eq.${classId}`)
      .lte('start_date', to).gte('end_date', from),
    supabase
      .from('assignments').select('*')
      .eq('class_id', classId).gte('due_date', from).lte('due_date', to).order('due_date'),
    studentId
      ? supabase
          .from('student_events').select('*')
          .eq('student_id', studentId).gte('lesson_date', from).lte('lesson_date', to)
      : Promise.resolve({ data: [] as StudentEvent[] }),
  ]);

  const lessons = (lessonsRes.data ?? []) as Lesson[];
  const changes: LessonChange[] = lessons.length
    ? (((
        await supabase
          .from('lesson_changes')
          .select('*, substitute:profiles!lesson_changes_substitute_teacher_id_fkey(full_name)')
          .in('lesson_id', lessons.map((l) => l.id))
          .gte('change_date', from).lte('change_date', to)
      ).data ?? []) as LessonChange[])
    : [];

  // דריסות פרטניות: בתצוגת תלמיד — רק שלו; בתצוגה כיתתית של צוות — כל מה ש-RLS מתיר לראות
  let studentChanges: StudentChange[] = [];
  const wantOverrides = lessons.length && (studentId ? scope === 'personal' : true);
  if (wantOverrides && (await supportsStudentOverrides())) {
    let q = supabase
      .from('lesson_student_changes')
      .select('*, substitute:profiles!lesson_student_changes_substitute_teacher_id_fkey(full_name)')
      .in('lesson_id', lessons.map((l) => l.id))
      .lte('change_date', to)
      .or(`until_date.gte.${from},change_date.gte.${from}`);
    if (studentId) q = q.eq('student_id', studentId);
    studentChanges = ((await q).data ?? []) as StudentChange[];
  }

  return {
    lessons,
    changes,
    studentChanges,
    calendar: (calRes.data ?? []) as CalendarEvent[],
    assignments: (asgRes.data ?? []) as Assignment[],
    events: (evRes.data ?? []) as StudentEvent[],
  };
}
