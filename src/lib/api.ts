// פעולות כתיבה — ישירות מהלקוח מול Supabase (במקום Server Actions).
// כל פעולה רצה עם ה-JWT של המשתמש המחובר, ולכן כפופה במלואה ל-RLS.
import { getSupabase } from './supabase/client';
import type { AssignmentType, ExceptionType, Lesson, LessonChangeKind, Profile, RequestKind, Role } from './types';

export type Result = { ok: true } | { ok: false; error: string };

// ---- תאימות לאחור: לפני הרצת מיגרציה 0004 אין עמודות color/note/new_color ----
const EXTRA_KEYS = ['color', 'note', 'new_color'] as const;
let extrasSupported = true;
/** האם מסד הנתונים כבר תומך בצבע ובהערה קבועה */
export const dbSupportsExtras = () => extrasSupported;
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /column .*(does not exist|schema cache)/i.test(e.message ?? ''));
const strip = <T extends Record<string, unknown>>(o: T, keepNote = false) => {
  const c: Record<string, unknown> = { ...o };
  EXTRA_KEYS.forEach((k) => { if (!(keepNote && k === 'note')) delete c[k]; });
  return c as T;
};
/** מריץ כתיבה; אם העמודות החדשות חסרות — מנסה שוב בלעדיהן */
async function writeCompat<P>(payload: P, write: (p: P) => PromiseLike<{ error: { code?: string; message?: string } | null; count?: number | null }>, keepNote = false) {
  const clean = (p: P): P => (Array.isArray(p) ? (p.map((x) => strip(x, keepNote)) as P) : (strip(p as Record<string, unknown>, keepNote) as P));
  if (!extrasSupported) return write(clean(payload));
  const r = await write(payload);
  if (isMissingColumn(r.error)) { extrasSupported = false; return write(clean(payload)); }
  return r;
}
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
  color?: string | null;
  note?: string | null;
  teacher_id: string | null;
  co_teacher_id: string | null;
  teacher_label: string | null;
  start_time: string;
  end_time: string;
  room: string | null;
}

const cleanFields = (f: LessonFields) => ({
  ...(f.color !== undefined ? { color: f.color || null } : {}),
  ...(f.note !== undefined ? { note: f.note?.trim() || null } : {}),
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
  const { error, count } = await writeCompat(cleanFields(f), (p) => getSupabase().from('lessons').update(p, { count: 'exact' }).eq('id', lessonId));
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
  new_color?: string | null;
  note?: string | null;
}

/** שינויים חד-פעמיים (אחד או רבים) — upsert לפי (שיעור, תאריך) */
export async function applyChanges(rows: ChangeRow[]): Promise<Result> {
  if (!rows.length) return fail('לא נבחרו שיעורים');
  const full = rows.map((r) => ({
    substitute_teacher_id: null, new_start_time: null, new_end_time: null,
    new_room: null, new_subject: null, note: null, new_color: null, ...r,
  }));
  // lesson_changes.note קיים מאז 0001 — שומרים אותו גם לפני מיגרציה 0004
  const { error } = await writeCompat(full, (p) => getSupabase().from('lesson_changes').upsert(p, { onConflict: 'lesson_id,change_date' }), true);
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

/** כל השיעורים של כיתה (לא אישיים) — לבחירת שיעור בעורך */
export async function fetchClassLessons(classId: string): Promise<Lesson[]> {
  const { data } = await getSupabase()
    .from('lessons')
    .select('*, teacher:profiles!lessons_teacher_id_fkey(full_name), co_teacher:profiles!lessons_co_teacher_id_fkey(full_name)')
    .eq('class_id', classId)
    .is('student_id', null)
    .order('start_time');
  return (data ?? []) as Lesson[];
}

export async function deleteCalendarEvent(id: string): Promise<Result> {
  const { error, count } = await getSupabase().from('calendar_events').delete({ count: 'exact' }).eq('id', id);
  if (error) return fail('המחיקה נכשלה');
  if (!count) return fail('אין הרשאה למחוק את האירוע');
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

// =====================================================================
// גרסה 1.2.0 — היקפי עריכה, הוספה מרובה, מחיקת כיתה, הערות לכיתה
// =====================================================================

/** כל השיעורים הקבועים באותה משבצת (אותה שעת התחלה) בכיתה — לכל ימי השבוע */
export async function fetchSlotLessons(classId: string, startTime: string, studentId: string | null): Promise<Lesson[]> {
  let q = getSupabase().from('lessons').select('*').eq('class_id', classId).eq('start_time', startTime).is('specific_date', null);
  q = studentId ? q.eq('student_id', studentId) : q.is('student_id', null);
  const { data } = await q;
  return (data ?? []) as Lesson[];
}

/** עדכון חלקי קבוע של כמה שיעורים (רק השדות שהשתנו) */
export async function updateLessonsPartial(ids: string[], patch: Partial<LessonFields>): Promise<Result> {
  if (!ids.length) return fail('לא נמצאו שיעורים לעדכון');
  if (patch.start_time && patch.end_time && patch.end_time <= patch.start_time) return fail('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
  const { error, count } = await writeCompat(patch, (p) => getSupabase().from('lessons').update(p, { count: 'exact' }).in('id', ids));
  if (error || !count) return fail('אין הרשאה לערוך את המערכת הקבועה');
  return ok();
}

/** הוספת כמה שיעורים בבת אחת (למשל "כל הימים" / "רק השבוע") */
export async function addLessons(rows: (LessonFields & {
  classId: string; date: string; dayOfWeek: number; recurring: boolean; studentId?: string | null;
})[]): Promise<Result> {
  for (const r of rows) { const v = validate(r); if (v) return fail(v); }
  const { error } = await writeCompat(rows.map((r) => ({
    ...cleanFields(r),
    class_id: r.classId,
    student_id: r.studentId || null,
    day_of_week: r.dayOfWeek,
    specific_date: r.recurring ? null : r.date,
    valid_from: r.recurring ? r.date : null,
  })), (p) => getSupabase().from('lessons').insert(p));
  return error ? fail('הוספת השיעורים נכשלה (אין הרשאה?)') : ok();
}

/** הסרת כמה שיעורים קבועים מהמערכת החל מתאריך */
export async function endLessons(ids: string[], fromDate: string): Promise<Result> {
  if (!ids.length) return fail('לא נמצאו שיעורים');
  const { error } = await getSupabase().from('lessons').update({ valid_to: addDaysISO(fromDate, -1) }).in('id', ids);
  return error ? fail('אין הרשאה') : ok();
}

/** מה יושפע ממחיקת כיתה — להצגה בחלונית האזהרה */
export async function classDeletionImpact(classId: string) {
  const s = getSupabase();
  const [lessons, students, assignments] = await Promise.all([
    s.from('lessons').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    s.from('profiles').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('role', 'student'),
    s.from('assignments').select('id', { count: 'exact', head: true }).eq('class_id', classId),
  ]);
  return { lessons: lessons.count ?? 0, students: students.count ?? 0, assignments: assignments.count ?? 0 };
}

/** מחיקת כיתה (מנהל-על; RLS classes_admin). מוחק בשרשרת את המערכת, השינויים, ההערות והמשימות שלה. */
export async function adminDeleteClass(classId: string): Promise<Result> {
  const { error, count } = await getSupabase().from('classes').delete({ count: 'exact' }).eq('id', classId);
  if (error) return fail('מחיקת הכיתה נכשלה');
  if (!count) return fail('אין הרשאה למחוק את הכיתה');
  return ok();
}

export interface ClassNote {
  id: string;
  type: ExceptionType;
  note: string | null;
  status: string | null;
  retracted: boolean;
  lesson_date: string;
  created_at: string;
  reporter_id: string | null;
  student: { full_name: string } | null;
  reporter: { full_name: string } | null;
  lesson: { subject: string; class_id: string } | null;
}

/** כל ההערות/הדיווחים על תלמידי כיתה (RLS: מחנך הכיתה / מנהל רואים הכל; מורה — את שלו) */
export async function fetchClassNotes(classId: string, sinceDate: string): Promise<ClassNote[]> {
  const { data } = await getSupabase()
    .from('student_events')
    .select(`id, type, note, status, retracted, lesson_date, created_at, reporter_id,
      student:profiles!student_events_student_id_fkey(full_name),
      reporter:profiles!student_events_reporter_id_fkey(full_name),
      lesson:lessons!inner(subject, class_id)`)
    .eq('lesson.class_id', classId)
    .gte('lesson_date', sinceDate)
    .order('created_at', { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as ClassNote[];
}

/** מספר הערות חדשות שמורים אחרים הזינו מאז הצפייה האחרונה (לתג בתפריט) */
export async function countNewNotes(sinceIso: string, myId: string): Promise<number> {
  const { count } = await getSupabase()
    .from('student_events')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', sinceIso)
    .neq('reporter_id', myId);
  return count ?? 0;
}

// =====================================================================
// גרסה 1.4.0 — מערכת פרטנית לתלמיד (lesson_student_changes)
// =====================================================================

/** סוף שנת הלימודים: 30.6 של השנה הנוכחית (או הבאה, אם כבר אחרי 1.9) */
export function schoolYearEnd(fromDate: string) {
  const y = Number(fromDate.slice(0, 4));
  const m = Number(fromDate.slice(5, 7));
  return `${m >= 9 ? y + 1 : y}-06-30`;
}

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /lesson_student_changes/.test(e.message ?? ''));

/** שיעורים אישיים של תלמיד בכיתה */
export async function fetchStudentLessons(classId: string, studentId: string): Promise<Lesson[]> {
  const { data } = await getSupabase()
    .from('lessons')
    .select('*, teacher:profiles!lessons_teacher_id_fkey(full_name), co_teacher:profiles!lessons_co_teacher_id_fkey(full_name)')
    .eq('class_id', classId).eq('student_id', studentId).order('start_time');
  return (data ?? []) as Lesson[];
}

export interface StudentChangeRow extends ChangeRow { student_id: string; until_date?: string | null }

/** דריסות פרטניות — upsert לפי (שיעור, תלמיד, תאריך) */
export async function applyStudentChanges(rows: StudentChangeRow[]): Promise<Result> {
  if (!rows.length) return fail('לא נבחרו שיעורים');
  const full = rows.map((r) => ({
    substitute_teacher_id: null, new_start_time: null, new_end_time: null, new_room: null,
    new_subject: null, new_color: null, note: null, until_date: null, ...r,
  }));
  const { error } = await getSupabase().from('lesson_student_changes').upsert(full, { onConflict: 'lesson_id,student_id,change_date' });
  if (isMissingTable(error)) return fail('כדי לשמור שינוי פרטני לתלמיד יש להריץ ב-Supabase את SETUP_UPGRADE_0005.sql (גרסה 1.4.0).');
  return error ? fail('השמירה נכשלה (אין הרשאה?)') : ok();
}

export async function deleteStudentChanges(ids: string[]): Promise<Result> {
  if (!ids.length) return ok();
  const { error } = await getSupabase().from('lesson_student_changes').delete().in('id', ids);
  return error ? fail('השחזור נכשל') : ok();
}

/**
 * כתיבת שינויים "לפי הקשר": בתצוגה כיתתית — שינוי לכל הכיתה;
 * בתצוגת תלמיד — דריסה פרטנית לשיעורים כיתתיים (ושינוי רגיל לשיעורים האישיים שלו).
 * recurring: חוזר כל שבוע עד סוף השנה (רק לדריסה פרטנית).
 */
export async function commitChanges(
  studentId: string | null,
  items: { lesson: Pick<Lesson, 'id' | 'student_id'>; row: ChangeRow; recurring?: boolean }[],
): Promise<Result> {
  const classRows = items.filter((i) => !studentId || i.lesson.student_id).map((i) => i.row);
  const studentRows = items.filter((i) => studentId && !i.lesson.student_id).map((i) => ({
    ...i.row, student_id: studentId!, until_date: i.recurring ? schoolYearEnd(i.row.change_date) : null,
  }));
  if (classRows.length) { const r = await applyChanges(classRows); if (!r.ok) return r; }
  if (studentRows.length) { const r = await applyStudentChanges(studentRows); if (!r.ok) return r; }
  if (!classRows.length && !studentRows.length) return fail('לא נבחרו שיעורים');
  return ok();
}

// =====================================================================
// גרסה 1.5.0 — קהל יעד: כל הכיתה / תלמידים נבחרים
// =====================================================================

/** תלמידי כיתה (לבורר קהל היעד) */
export async function fetchClassStudents(classId: string): Promise<{ id: string; full_name: string }[]> {
  const { data } = await getSupabase().from('profiles').select('id, full_name')
    .eq('role', 'student').eq('class_id', classId).order('full_name');
  return data ?? [];
}

/** כל השיעורים האישיים בכיתה (מחנך/מנהל רואים את כולם) */
export async function fetchClassPersonalLessons(classId: string): Promise<Lesson[]> {
  const { data } = await getSupabase()
    .from('lessons')
    .select('*, teacher:profiles!lessons_teacher_id_fkey(full_name), co_teacher:profiles!lessons_co_teacher_id_fkey(full_name)')
    .eq('class_id', classId).not('student_id', 'is', null).order('start_time');
  return (data ?? []) as Lesson[];
}
