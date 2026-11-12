// פעולות כתיבה — ישירות מהלקוח מול Supabase (במקום Server Actions).
// כל פעולה רצה עם ה-JWT של המשתמש המחובר, ולכן כפופה במלואה ל-RLS.
import { getSupabase } from './supabase/client';
import type { AssignmentType, ExceptionType, LessonChangeKind, Profile, RequestKind, Role } from './types';

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
    .select('id, username, full_name, role, class_id, is_admin')
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

// =====================================================================
// עריכת מערכת (מחנך / מנהל) — RLS: is_homeroom_of(class)
// =====================================================================
export interface LessonFields {
  subject: string;
  teacher_id: string | null;
  co_teacher_id: string | null;
  teacher_label: string | null;
  start_time: string;
  end_time: string;
  room: string | null;
}

const cleanFields = (f: LessonFields) => ({
  subject: f.subject.trim(),
  teacher_id: f.teacher_id || null,
  co_teacher_id: f.co_teacher_id || null,
  teacher_label: f.teacher_label?.trim() || null,
  start_time: f.start_time,
  end_time: f.end_time,
  room: f.room?.trim() || null,
});

const validate = (f: LessonFields) =>
  !f.subject.trim() ? 'יש להזין מקצוע / פעילות'
  : !f.start_time || !f.end_time || f.end_time <= f.start_time ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה'
  : null;

/** שינוי קבוע בתבנית השבועית */
export async function updateLessonPermanent(lessonId: string, f: LessonFields): Promise<Result> {
  const v = validate(f); if (v) return fail(v);
  const { error, count } = await getSupabase().from('lessons').update(cleanFields(f), { count: 'exact' }).eq('id', lessonId);
  if (error || !count) return fail('אין הרשאה לערוך את המערכת הקבועה');
  return ok();
}

/** הוספת שיעור: חד-פעמי (specific_date) או שבועי קבוע החל מתאריך */
export async function addLesson(input: LessonFields & {
  classId: string; date: string; dayOfWeek: number; recurring: boolean; studentId?: string | null;
}): Promise<Result> {
  const v = validate(input); if (v) return fail(v);
  const { error } = await getSupabase().from('lessons').insert({
    ...cleanFields(input),
    class_id: input.classId,
    student_id: input.studentId || null,
    day_of_week: input.dayOfWeek,
    specific_date: input.recurring ? null : input.date,
    valid_from: input.recurring ? input.date : null,
  });
  return error ? fail('הוספת השיעור נכשלה (אין הרשאה?)') : ok();
}

/** הסרה מהמערכת הקבועה מתאריך מסוים (ההיסטוריה נשמרת). שיעור חד-פעמי — נמחק. */
export async function endLesson(lessonId: string, fromDate: string, isOneTime: boolean): Promise<Result> {
  const supabase = getSupabase();
  const { error } = isOneTime
    ? await supabase.from('lessons').delete().eq('id', lessonId)
    : await supabase.from('lessons').update({ valid_to: addDaysISO(fromDate, -1) }).eq('id', lessonId);
  return error ? fail('אין הרשאה') : ok();
}

const addDaysISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface ChangeRow {
  lesson_id: string;
  change_date: string;
  kind: LessonChangeKind;
  substitute_teacher_id?: string | null;
  new_start_time?: string | null;
  new_end_time?: string | null;
  new_room?: string | null;
  new_subject?: string | null;
  note?: string | null;
}

/** שינויים חד-פעמיים (אחד או רבים) — upsert לפי (שיעור, תאריך) */
export async function applyChanges(rows: ChangeRow[]): Promise<Result> {
  if (!rows.length) return fail('לא נבחרו שיעורים');
  const full = rows.map((r) => ({
    substitute_teacher_id: null, new_start_time: null, new_end_time: null,
    new_room: null, new_subject: null, note: null, ...r,
  }));
  const { error } = await getSupabase().from('lesson_changes').upsert(full, { onConflict: 'lesson_id,change_date' });
  return error ? fail('השמירה נכשלה (אין הרשאה?)') : ok();
}

/** ביטול שינויים חד-פעמיים — חזרה למערכת הקבועה */
export async function restoreChanges(items: { lessonId: string; date: string }[]): Promise<Result> {
  const supabase = getSupabase();
  for (const it of items) {
    const { error } = await supabase.from('lesson_changes').delete().eq('lesson_id', it.lessonId).eq('change_date', it.date);
    if (error) return fail('השחזור נכשל');
  }
  return ok();
}

export async function addCalendarEvent(input: {
  classId: string; kind: 'trip' | 'event' | 'holiday'; title: string; startDate: string; endDate: string;
}): Promise<Result> {
  if (!input.title.trim()) return fail('יש להזין שם לפעילות');
  const { error } = await getSupabase().from('calendar_events').insert({
    class_id: input.classId, kind: input.kind, title: input.title.trim(),
    start_date: input.startDate, end_date: input.endDate,
  });
  return error ? fail('הוספת האירוע נכשלה') : ok();
}

// =====================================================================
// ניהול משתמשים (מנהל-על) — פונקציות RPC ב-DB שבודקות is_admin()
// =====================================================================
export interface AdminUserInput {
  username: string;
  password: string;
  full_name: string;
  role: Role;
  class_id: string | null;
  children: string[];
  is_admin: boolean;
}

const rpcError = (e: { message: string } | null, fallback: string) =>
  fail(e?.message && /[֐-׿]/.test(e.message) ? e.message : fallback);

export async function adminCreateUser(u: AdminUserInput): Promise<Result> {
  const { error } = await getSupabase().rpc('admin_create_user', {
    p_username: u.username.trim().toLowerCase(), p_password: u.password, p_full_name: u.full_name,
    p_role: u.role, p_class_id: u.class_id || null, p_children: u.children, p_is_admin: u.is_admin,
  });
  return error ? rpcError(error, 'יצירת המשתמש נכשלה') : ok();
}

export async function adminUpdateUser(id: string, u: Omit<AdminUserInput, 'username'>): Promise<Result> {
  const { error } = await getSupabase().rpc('admin_update_user', {
    p_id: id, p_full_name: u.full_name, p_role: u.role, p_class_id: u.class_id || null,
    p_password: u.password || null, p_children: u.role === 'parent' ? u.children : null, p_is_admin: u.is_admin,
  });
  return error ? rpcError(error, 'עדכון המשתמש נכשל') : ok();
}

export async function adminDeleteUser(id: string): Promise<Result> {
  const { error } = await getSupabase().rpc('admin_delete_user', { p_id: id });
  return error ? rpcError(error, 'מחיקת המשתמש נכשלה') : ok();
}

export async function adminCreateClass(name: string, grade: number | null): Promise<Result> {
  if (!name.trim()) return fail('יש להזין שם כיתה');
  const { error } = await getSupabase().from('classes').insert({ name: name.trim(), grade });
  return error ? fail('יצירת הכיתה נכשלה') : ok();
}
