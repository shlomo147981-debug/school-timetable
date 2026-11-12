// פעולות כתיבה — ישירות מהלקוח מול Supabase (במקום Server Actions).
// כל פעולה רצה עם ה-JWT של המשתמש המחובר, ולכן כפופה במלואה ל-RLS.
import { getSupabase } from './supabase/client';
import type { AssignmentType, ExceptionType, LessonChangeKind, Profile, RequestKind } from './types';

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (): Result => ({ ok: true });

/** מזהה משתמש ייחודי -> אימייל פנימי ב-Supabase Auth */
const toEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${process.env.NEXT_PUBLIC_LOGIN_DOMAIN ?? 'school.local'}`;

async function currentUserId() {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function login(username: string, password: string): Promise<Result> {
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim()) || !password) {
    return fail('יש להזין מזהה משתמש וסיסמה תקינים');
  }
  const { error } = await getSupabase().auth.signInWithPassword({ email: toEmail(username), password });
  if (!error) return ok();
  return fail(/fetch|network/i.test(error.message) ? 'אין חיבור לאינטרנט' : 'מזהה משתמש או סיסמה שגויים');
}

export async function logout() {
  await getSupabase().auth.signOut();
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data } = await getSupabase()
    .from('profiles')
    .select('id, username, full_name, role, class_id')
    .eq('id', userId)
    .maybeSingle<Profile>();
  return data ?? null;
}

export async function reportException(input: {
  lessonId: string; lessonDate: string; studentIds: string[]; type: ExceptionType; note?: string;
}): Promise<Result> {
  if (!input.studentIds.length) return fail('יש לבחור לפחות תלמיד אחד');
  const uid = await currentUserId();
  if (!uid) return fail('לא מחובר');
  const rows = input.studentIds.map((student_id) => ({
    lesson_id: input.lessonId,
    lesson_date: input.lessonDate,
    student_id,
    reporter_id: uid,
    type: input.type,
    note: input.note?.trim() || null,
  }));
  const { error } = await getSupabase().from('student_events').insert(rows);
  return error ? fail('אין הרשאה לדווח על שיעור זה') : ok();
}

export async function addAssignment(input: {
  lessonId: string; classId: string; type: AssignmentType; title: string; dueDate: string; description?: string;
}): Promise<Result> {
  if (!input.title.trim()) return fail('יש להזין כותרת');
  const uid = await currentUserId();
  if (!uid) return fail('לא מחובר');
  const { error } = await getSupabase().from('assignments').insert({
    lesson_id: input.lessonId,
    class_id: input.classId,
    type: input.type,
    title: input.title.trim(),
    due_date: input.dueDate,
    description: input.description?.trim() || null,
    created_by: uid,
  });
  return error ? fail('אין הרשאה להוסיף משימה לשיעור זה') : ok();
}

/** מחנך בלבד (נאכף ב-RLS): ביטול / מחליף / הזזה / חדר למופע ספציפי */
export async function changeLesson(input: {
  lessonId: string; date: string; kind: LessonChangeKind | 'restore';
  substituteId?: string; newStart?: string; newEnd?: string; newRoom?: string; note?: string;
}): Promise<Result> {
  const supabase = getSupabase();
  if (input.kind === 'restore') {
    const { error } = await supabase.from('lesson_changes')
      .delete().eq('lesson_id', input.lessonId).eq('change_date', input.date);
    return error ? fail(error.message) : ok();
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
  return error ? fail('רק מחנך/ת הכיתה רשאי/ת לשנות את המערכת') : ok();
}

export async function submitRequest(input: {
  studentId: string; teacherId: string; kind: RequestKind; message: string;
  eventId?: string | null; lessonId?: string; lessonDate?: string; attachmentPath?: string | null;
}): Promise<Result> {
  if (!input.message.trim()) return fail('יש לכתוב הודעה למורה');
  const uid = await currentUserId();
  if (!uid) return fail('לא מחובר');
  const { error } = await getSupabase().from('student_requests').insert({
    student_id: input.studentId,
    created_by: uid,
    teacher_id: input.teacherId,
    kind: input.kind,
    message: input.message.trim(),
    event_id: input.eventId ?? null,
    lesson_id: input.lessonId ?? null,
    lesson_date: input.lessonDate ?? null,
    attachment_path: input.attachmentPath ?? null,
  });
  return error ? fail('שליחת הבקשה נכשלה') : ok();
}

export async function resolveRequest(input: {
  requestId: string; status: 'approved' | 'rejected'; response?: string;
}): Promise<Result> {
  const { error, count } = await getSupabase()
    .from('student_requests')
    .update({ status: input.status, response: input.response?.trim() || null }, { count: 'exact' })
    .eq('id', input.requestId)
    .eq('status', 'open');
  if (error) return fail(error.message);
  if (!count) return fail('הבקשה לא נמצאה או שכבר טופלה');
  return ok();
}
