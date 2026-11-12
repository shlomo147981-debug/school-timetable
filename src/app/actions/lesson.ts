'use server';

// Server Actions — עוברים דרך הלקוח של המשתמש המחובר (anon key + JWT),
// ולכן כל פעולה כפופה ל-RLS. הבדיקות כאן הן לנוחות/הודעות שגיאה בלבד.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { AssignmentType, ExceptionType, LessonChangeKind, RequestKind } from '@/lib/types';

type Result = { ok: true } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const done = (): Result => { revalidatePath('/schedule'); revalidatePath('/requests'); return { ok: true }; };

export async function reportException(input: {
  lessonId: string; lessonDate: string; studentIds: string[]; type: ExceptionType; note?: string;
}): Promise<Result> {
  if (!input.studentIds.length) return fail('יש לבחור לפחות תלמיד אחד');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('לא מחובר');

  const rows = input.studentIds.map((student_id) => ({
    lesson_id: input.lessonId,
    lesson_date: input.lessonDate,
    student_id,
    reporter_id: user.id,
    type: input.type,
    note: input.note?.trim() || null,
  }));
  const { error } = await supabase.from('student_events').insert(rows);
  return error ? fail('אין הרשאה לדווח על שיעור זה') : done();
}

export async function addAssignment(input: {
  lessonId: string; classId: string; type: AssignmentType; title: string; dueDate: string; description?: string;
}): Promise<Result> {
  if (!input.title.trim()) return fail('יש להזין כותרת');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('לא מחובר');

  const { error } = await supabase.from('assignments').insert({
    lesson_id: input.lessonId,
    class_id: input.classId,
    type: input.type,
    title: input.title.trim(),
    due_date: input.dueDate,
    description: input.description?.trim() || null,
    created_by: user.id,
  });
  return error ? fail('אין הרשאה להוסיף משימה לשיעור זה') : done();
}

/** מחנך בלבד (נאכף ב-RLS): ביטול / מחליף / הזזה / חדר למופע ספציפי */
export async function changeLesson(input: {
  lessonId: string; date: string; kind: LessonChangeKind | 'restore';
  substituteId?: string; newStart?: string; newEnd?: string; newRoom?: string; note?: string;
}): Promise<Result> {
  const supabase = await createClient();
  if (input.kind === 'restore') {
    const { error } = await supabase.from('lesson_changes')
      .delete().eq('lesson_id', input.lessonId).eq('change_date', input.date);
    return error ? fail(error.message) : done();
  }
  if (input.kind === 'substitute' && !input.substituteId) return fail('יש לבחור מורה מחליף');
  const { error } = await supabase.from('lesson_changes').upsert(
    {
      lesson_id: input.lessonId,
      change_date: input.date,
      kind: input.kind,
      substitute_teacher_id: input.kind === 'substitute' ? input.substituteId : null,
      new_start_time: input.kind === 'moved' ? input.newStart || null : null,
      new_end_time: input.kind === 'moved' ? input.newEnd || null : null,
      new_room: input.newRoom?.trim() || null,
      note: input.note?.trim() || null,
    },
    { onConflict: 'lesson_id,change_date' },
  );
  return error ? fail('רק מחנך/ת הכיתה רשאי/ת לשנות את המערכת') : done();
}

export async function submitRequest(input: {
  studentId: string; teacherId: string; kind: RequestKind; message: string;
  eventId?: string | null; lessonId?: string; lessonDate?: string; attachmentPath?: string | null;
}): Promise<Result> {
  if (!input.message.trim()) return fail('יש לכתוב הודעה למורה');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('לא מחובר');

  const { error } = await supabase.from('student_requests').insert({
    student_id: input.studentId,
    created_by: user.id,
    teacher_id: input.teacherId,
    kind: input.kind,
    message: input.message.trim(),
    event_id: input.eventId ?? null,
    lesson_id: input.lessonId ?? null,
    lesson_date: input.lessonDate ?? null,
    attachment_path: input.attachmentPath ?? null,
  });
  return error ? fail('שליחת הבקשה נכשלה') : done();
}

export async function resolveRequest(input: {
  requestId: string; status: 'approved' | 'rejected'; response?: string;
}): Promise<Result> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('student_requests')
    .update({ status: input.status, response: input.response?.trim() || null }, { count: 'exact' })
    .eq('id', input.requestId)
    .eq('status', 'open');
  if (error) return fail(error.message);
  if (!count) return fail('הבקשה לא נמצאה או שכבר טופלה');
  return done();
}
