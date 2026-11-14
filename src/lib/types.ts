export type Role = 'teacher' | 'homeroom' | 'student' | 'parent';
export type View = 'day' | 'week' | 'month';
export type ExceptionType = 'absence' | 'late' | 'missing_equipment' | 'misbehavior' | 'praise';
export type ExceptionStatus = 'pending_justification' | 'justified' | 'unjustified';
export type AssignmentType = 'homework' | 'exam' | 'quiz' | 'event';
export type LessonChangeKind = 'cancelled' | 'substitute' | 'moved' | 'room_change' | 'modified' | 'removed';
export type CalendarKind = 'holiday' | 'trip' | 'event';
export type RequestKind = 'justify_absence' | 'appeal_note' | 'other';
export type RequestStatus = 'open' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  class_id: string | null;
  is_admin: boolean;
}

export interface Person {
  id: string;
  full_name: string;
}

export interface ClassRow {
  id: string;
  name: string;
  homeroom_teacher_id: string | null;
}

export interface Lesson {
  id: string;
  class_id: string;
  teacher_id: string | null;
  co_teacher_id: string | null;
  teacher_label: string | null;
  /** צבע תצוגה (אחרי מיגרציה 0004) */
  color?: string | null;
  /** תיאור/הערה קבועה לתלמידים ולהורים (אחרי מיגרציה 0004) */
  note?: string | null;
  student_id: string | null;
  subject: string;
  room: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  valid_from: string | null;
  valid_to: string | null;
  teacher: { full_name: string } | null;
  co_teacher: { full_name: string } | null;
}

export interface LessonChange {
  id: string;
  lesson_id: string;
  change_date: string;
  kind: LessonChangeKind;
  substitute_teacher_id: string | null;
  new_start_time: string | null;
  new_end_time: string | null;
  new_room: string | null;
  new_subject: string | null;
  new_color?: string | null;
  note: string | null;
  substitute: { full_name: string } | null;
}

export interface CalendarEvent {
  /** הערה לתלמידים ולהורים (מיגרציה 0008) */
  note?: string | null;
  /** 'il-calendar' = חג/מועד מלוח השנה הישראלי (נשמר באיפוס מערכת) */
  source?: string | null;
  id: string;
  class_id: string | null;
  kind: CalendarKind;
  title: string;
  start_date: string;
  end_date: string;
}

export interface Assignment {
  created_by?: string | null;
  id: string;
  lesson_id: string | null;
  class_id: string;
  type: AssignmentType;
  title: string;
  due_date: string;
  description: string | null;
}

export interface StudentEvent {
  /** שמות (נטען לצוות) */
  student?: { full_name: string } | null;
  reporter?: { full_name: string } | null;
  id: string;
  lesson_id: string;
  lesson_date: string;
  student_id: string;
  reporter_id: string;
  type: ExceptionType;
  note: string | null;
  status: ExceptionStatus | null;
  retracted: boolean;
  created_at: string;
}

/** דריסה פרטנית של שיעור לתלמיד אחד (טבלה lesson_student_changes, מיגרציה 0005) */
export interface StudentChange extends LessonChange {
  student_id: string;
  /** null = רק בתאריך change_date; אחרת חוזר כל שבוע עד התאריך הזה */
  until_date: string | null;
}

/** מופע קונקרטי של שיעור בתאריך מסוים, אחרי החלת שינויים */
export interface Occurrence {
  key: string;
  date: string;
  lesson: Lesson;
  /** מקצוע אפקטיבי (אחרי שינוי חד-פעמי) */
  subject: string;
  /** השינוי החד-פעמי הגולמי (אם יש) */
  change: LessonChange | null;
  start: string;
  end: string;
  room: string | null;
  teacherId: string | null;
  teacherName: string;
  status: 'normal' | LessonChangeKind;
  changeNote: string | null;
  personal: boolean;
  /** השינוי במופע הוא דריסה פרטנית של התלמיד המוצג */
  personalOverride: boolean;
  /** (צוות, תצוגה כיתתית) דריסות פרטניות של תלמידים בשיעור הזה */
  studentOverrides: StudentChange[];
  /** (צוות, תצוגה כיתתית) שיעור אישי/קבוצתי: כל השיעורים האישיים הזהים במשבצת, עם שמות התלמידים */
  groupLessons?: { lesson: Lesson; name: string }[];
  assignments: Assignment[];
  events: StudentEvent[];
}

export const ROLE_LABEL: Record<Role, string> = {
  teacher: 'מורה מקצועי',
  homeroom: 'מחנך/ת כיתה',
  student: 'תלמיד/ה',
  parent: 'הורה',
};

export const EXCEPTION_LABEL: Record<ExceptionType, string> = {
  absence: 'חיסור',
  late: 'איחור',
  missing_equipment: 'אי-הבאת ציוד',
  misbehavior: 'הפרעה',
  praise: 'חיזוק חיובי',
};

export const EXCEPTION_STATUS_LABEL: Record<ExceptionStatus, string> = {
  pending_justification: 'ממתין להצדקה',
  justified: 'מוצדק',
  unjustified: 'לא מוצדק',
};

export const ASSIGNMENT_LABEL: Record<AssignmentType, string> = {
  homework: 'שיעורי בית',
  exam: 'מבחן',
  quiz: 'בוחן',
  event: 'אירוע',
};

export const CHANGE_LABEL: Record<LessonChangeKind, string> = {
  cancelled: 'בוטל',
  substitute: 'מורה מחליף',
  moved: 'שינוי שעה',
  room_change: 'החלפת חדר',
  modified: 'שינוי במערכת',
  removed: 'נמחק',
};

export const CALENDAR_LABEL: Record<CalendarKind, string> = {
  holiday: 'חופשה',
  trip: 'טיול',
  event: 'אירוע',
};

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  justify_absence: 'הצדקת חיסור/איחור',
  appeal_note: 'בקשה לבירור/שינוי הערה',
  other: 'אחר',
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'פתוחה',
  approved: 'אושרה',
  rejected: 'נדחתה',
};

export const isStaff = (r: Role) => r === 'teacher' || r === 'homeroom';

/** סימון בשדה note של lesson_changes: השיעור הוחלף בפעילות מיוחדת */
export const SPECIAL_NOTE = 'פעילות מיוחדת';
export const isSpecialNote = (n: string | null | undefined) => !!n && n.startsWith(SPECIAL_NOTE);
/** תיאור שהמחנך הוסיף לפעילות מיוחדת ("פעילות מיוחדת: …") */
export const specialDetail = (n: string | null | undefined) => (isSpecialNote(n) ? n!.slice(SPECIAL_NOTE.length).replace(/^:\s*/, '') : '');

export const EARLY_DISMISSAL_PREFIX = 'סיום יום לימודים בשעה';
/** מזהה הודעת סיום יום (כולל הנוסח הישן "סיום יום לימודים מוקדם בשעה") */
export const isDayEndNotice = (t: string | null | undefined) => !!t && t.startsWith('סיום יום לימודים');

/** מחיקה מלאה לפני מיגרציה 0006: נשמרת כ-cancelled עם הסימון הזה בתחילת ה-note */
export const REMOVED_MARK = '[[removed]]';
export const isRemovedChange = (c: { kind: string; note?: string | null } | null | undefined) =>
  !!c && (c.kind === 'removed' || !!c.note?.startsWith(REMOVED_MARK));
export const cleanNote = (n: string | null | undefined) => (n?.startsWith(REMOVED_MARK) ? n.slice(REMOVED_MARK.length) || null : n ?? null);

/** היקף החלת עריכה (כמו "אירוע זה / כל האירועים" ביומן) */
export type EditScope = 'once' | 'week' | 'allDays' | 'until' | 'year';
