import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassRow, Person, Profile } from './types';
import { isStaff } from './types';

export type Scope = 'personal' | 'class';

export interface ViewContext {
  classId: string | null;
  className: string;
  /** התלמיד שמערכתו מוצגת (null = מערכת כיתתית בלבד) */
  studentId: string | null;
  scope: Scope;
  classes: ClassRow[];      // צוות: כיתות שאני מלמד בהן
  students: Person[];       // צוות: תלמידי הכיתה הנבחרת
  children: (Person & { class_id: string | null })[]; // הורה: הילדים שלו
  teachers: Person[];       // מחנך: לשיבוץ מחליף
  canEditSchedule: boolean; // מחנך של הכיתה הנבחרת או מנהל-על
  homeroomId: string | null; // נמען ברירת מחדל לבקשות כשאין מורה לשיעור
}

/**
 * קובע "את מה רואים" לפי תפקיד + פרמטרים ב-URL.
 * שימו לב: זו רק בחירת תצוגה — האכיפה האמיתית היא ב-RLS.
 * גם אם הורה ישנה ידנית ?child=<id של ילד אחר>, השאילתות יחזירו ריק.
 */
export async function resolveContext(
  supabase: SupabaseClient,
  me: Profile,
  sp: Record<string, string | undefined>,
): Promise<ViewContext> {
  const ctx: ViewContext = {
    classId: null, className: '', studentId: null, scope: sp.scope === 'class' ? 'class' : 'personal',
    classes: [], students: [], children: [], teachers: [], canEditSchedule: false, homeroomId: null,
  };

  if (me.role === 'student') {
    ctx.studentId = me.id;
    ctx.classId = me.class_id;
  } else if (me.role === 'parent') {
    const { data } = await supabase
      .from('parent_children')
      .select('student:profiles!parent_children_student_id_fkey(id, full_name, class_id)')
      .eq('parent_id', me.id);
    ctx.children = (data ?? [])
      .map((r) => r.student as unknown as Person & { class_id: string | null })
      .filter(Boolean)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'));
    const child = ctx.children.find((c) => c.id === sp.child) ?? ctx.children[0];
    ctx.studentId = child?.id ?? null;
    ctx.classId = child?.class_id ?? null;
  } else if (isStaff(me.role)) {
    const { data: classes } = await supabase
      .from('classes').select('id, name, homeroom_teacher_id').order('name');
    ctx.classes = (classes ?? []) as ClassRow[];
    const selected =
      ctx.classes.find((c) => c.id === sp.class) ??
      ctx.classes.find((c) => c.homeroom_teacher_id === me.id) ??
      ctx.classes[0];
    ctx.classId = selected?.id ?? null;
    ctx.canEditSchedule = !!selected && (me.is_admin || (me.role === 'homeroom' && selected.homeroom_teacher_id === me.id));

    if (ctx.classId) {
      const { data: students } = await supabase
        .from('profiles').select('id, full_name')
        .eq('role', 'student').eq('class_id', ctx.classId).order('full_name');
      ctx.students = (students ?? []) as Person[];
      ctx.studentId = ctx.students.find((s) => s.id === sp.student)?.id ?? null;
    }
    if (ctx.canEditSchedule) {
      const { data: teachers } = await supabase
        .from('profiles').select('id, full_name').in('role', ['teacher', 'homeroom']).order('full_name');
      ctx.teachers = (teachers ?? []) as Person[];
    }
  }

  if (ctx.classId) {
    const fromList = ctx.classes.find((c) => c.id === ctx.classId);
    if (fromList) { ctx.className = fromList.name; ctx.homeroomId = fromList.homeroom_teacher_id; }
    else {
      const { data } = await supabase.from('classes').select('name, homeroom_teacher_id').eq('id', ctx.classId).maybeSingle();
      ctx.className = data?.name ?? '';
      ctx.homeroomId = data?.homeroom_teacher_id ?? null;
    }
  }
  return ctx;
}
