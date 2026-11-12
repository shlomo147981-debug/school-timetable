export type Role = 'teacher' | 'homeroom' | 'student' | 'parent';
export type View = 'day' | 'week' | 'month';
export type ExceptionType = 'absence' | 'late' | 'missing_equipment' | 'misbehavior' | 'praise';
export type ExceptionStatus = 'pending_justification' | 'justified' | 'unjustified';
export type AssignmentType = 'homework' | 'exam' | 'quiz' | 'event';
export type LessonChangeKind = 'cancelled' | 'substitute' | 'moved' | 'room_change';
export type CalendarKind = 'holiday' | 'trip' | 'event';
export type RequestKind = 'justify_absence' | 'appeal_note' | 'other';
export type RequestStatus = 'open' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  class_id: string | null;
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
  teacher_id: string;
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
  note: string | null;
  substitute: { full_name: string } | null;
}

export interface CalendarEvent {
  id: string;
  class_id: string | null;
  kind: CalendarKind;
  title: string;
  start_date: string;
  end_date: string;
}

export interface Assignment {
  id: string;
  lesson_id: string | null;
  class_id: string;
  type: AssignmentType;
  title: string;
  due_date: string;
  description: string | null;
}

export interface StudentEvent {
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

/** מופע קונקרטי של שיעור בתאריך מסוים, אחרי החלת שינויים */
export interface Occurrence {
  key: string;
  date: string;
  lesson: Lesson;
  start: string;
  end: string;
  room: string | null;
  teacherId: string;
  teacherName: string;
  status: 'normal' | LessonChangeKind;
  changeNote: string | null;
  personal: boolean;
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
