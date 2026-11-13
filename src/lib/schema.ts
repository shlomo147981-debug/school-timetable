import { getSupabase } from './supabase/client';

/**
 * בדיקה חד-פעמית: האם מסד הנתונים כבר עודכן למיגרציה 0005 (מערכת פרטנית לתלמיד).
 * לפני ההרצה — האפליקציה עובדת כרגיל, ורק שינויים פרטניים לתלמיד מושבתים.
 */
let probe: Promise<boolean> | null = null;
export function supportsStudentOverrides(): Promise<boolean> {
  if (!probe) {
    // GET ולא HEAD: מול טבלה שלא קיימת HEAD מחזיר 204 בלי שגיאה, ו-GET מחזיר PGRST205
    probe = Promise.resolve(getSupabase().from('lesson_student_changes').select('id').limit(1))
      .then(({ error }) => !error)
      .catch(() => false);
  }
  return probe;
}
export const STUDENT_SQL_HINT = 'כדי לשמור שינוי פרטני לתלמיד יש להריץ ב-Supabase את SETUP_UPGRADE_0005.sql (גרסה 1.4.0).';
