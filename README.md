# מערכת שעות בית-ספרית — Next.js 15 + Supabase + Tailwind (RTL)

## הפעלה
```bash
npm install
cp .env.example .env.local   # למלא URL + anon key (+ service role לסקריפט seed בלבד)
supabase db push             # או להריץ את supabase/migrations/*.sql לפי הסדר ב-SQL Editor
npm run seed                 # משתמשי דמו (אופציונלי)
npm run dev
```
**כניסה:** מזהה משתמש + סיסמה. מאחורי הקלעים `t200` ממופה ל-`t200@school.local` ב-Supabase Auth,
כך שאין צורך באימייל אמיתי. המשתמשים נוצרים רק ע"י מנהל (service role). אין הרשמה עצמית.
בהגדרות Auth של הפרויקט יש לכבות את Signups.

## ארכיטקטורה
```
supabase/migrations/
  0001_schema.sql        טבלאות, enums, טריגרים (סטטוס ברירת מחדל, הכרעה בבקשה)
  0002_rls.sql           כל מדיניות ה-RLS + פונקציות עזר בסכמת private + Storage
scripts/seed.mjs         נתוני דמו
src/
  middleware.ts          רענון סשן + הפניה ל-/login
  lib/
    supabase/{server,client}.ts
    auth.ts              requireProfile()
    context.ts           "מה מוצג" לפי תפקיד (כיתה / תלמיד / ילד נבחר)
    loadSchedule.ts      שאילתות (כולן כפופות ל-RLS)
    schedule.ts          תבנית שבועית → מופעים בתאריכים + החלת שינויים/חופשות
    dates.ts             ראשון–חמישי, גריד חודשי, ניווט
    types.ts             טיפוסים + תוויות בעברית
  app/
    login/               מסך כניסה
    (app)/schedule/      מסך מערכת (בורר יומי/שבועי/חודשי)
    (app)/requests/      תיבת בקשות (מורה: אישור/דחייה; תלמיד/הורה: מעקב)
    actions/             Server Actions: login, reportException, addAssignment,
                         changeLesson, submitRequest, resolveRequest
  components/
    schedule/            Toolbar, Board, DayView, WeekView, MonthView, LessonCard
    modals/              TeacherQuickModal (הערה / משימה / שינוי מערכת), RequestModal
```

## הרחבות לסכמה מה-PRD (והסיבה)
| תוספת | למה |
|---|---|
| `classes` | ה-PRD מפנה ל-`class_id` אבל לא מגדיר טבלה. כולל `homeroom_teacher_id` |
| `parent_children` במקום `parent_of[]` | FK אמיתי ואינדקס, ומדיניות RLS פשוטה ומהירה |
| `lessons.specific_date / valid_from / valid_to` | שיעור חד-פעמי (תוספת) ותבנית לתקופה |
| `lesson_changes` | ביטול / מחליף / הזזה / חדר למופע ספציפי בלי לשבור את התבנית השבועית |
| `calendar_events` | טיולים, חופשות ואירועים (תצוגה חודשית) |
| `student_events.lesson_date`, `retracted` | שיעור חוזר כל שבוע, אז צריך לדעת לאיזה מופע שייך האירוע. ערעור מאושר מבטל את ההערה בלי למחוק אותה |
| `student_requests` + bucket `request-attachments` | בקשות הצדקה/ערעור + צירוף אישור |

## אבטחה (RLS) — עיקרי ההבטחות
* **כל** טבלה עם RLS. ל-`anon` אין גישה בכלל. פונקציות העזר ב-`private` (לא נחשפות כ-RPC).
* **הורה** רואה תלמיד ⇔ קיימת שורה ב-`parent_children(parent_id = auth.uid())`.
  רואה כיתה ⇔ אחד מילדיו בה. הערות (`student_events`), בקשות, צרופות ופרופילים של תלמידים אחרים
  לעולם לא מוחזרים, גם אם משנים ידנית את `?child=` ב-URL.
* **תלמיד** רואה רק את עצמו + המערכת/המשימות של כיתתו. אין לו הרשאות כתיבה מלבד בקשות.
* **מורה מקצועי** מדווח/מוסיף משימות רק לשיעורים שהוא מלמד (או מחליף בהם באותו תאריך), ורק לתלמידי אותה כיתה.
* **מחנך** עורך את מערכת הכיתה (`lessons`, `lesson_changes`, `calendar_events`) ורואה את כל הדיווחים בכיתה.
* `profiles` ללא מדיניות כתיבה, ולכן אי אפשר להעלות לעצמך הרשאות.
* `student_requests`: למורה יש הרשאת UPDATE רק לעמודות `status, response`. השפעת ההכרעה על האירוע מתבצעת בטריגר.

### בדיקה ידנית של בידוד הורים (SQL Editor)
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where username='p400'))::text, true);
select full_name from profiles where role = 'student';   -- רק נועה ומיה
select count(*) from student_events where student_id not in (select student_id from parent_children where parent_id = auth.uid()); -- 0
rollback;
```

## אפליקציית אנדרואיד (Capacitor)
האפליקציה משתמשת ב-SSR / Middleware / Server Actions, ולכן **אין ייצוא סטטי**.
מעטפת האנדרואיד היא WebView מקורי שטוען את השרת החי (`server.url`).

1. פרסו את אתר ה-Next.js (למשל Vercel) וקבלו כתובת HTTPS.
2. הדביקו אותה ב-`capacitor.config.ts` (`SERVER_URL`) או העבירו `CAP_SERVER_URL`.
3. בנייה מקומית (דורש JDK 21 + Android SDK, `ANDROID_HOME`):
   ```bash
   CAP_SERVER_URL=https://my-school.vercel.app npm run android:apk
   ```
   הפלט: `android/app/build/outputs/apk/debug/app-debug.apk`
4. או בענן: `.github/workflows/android-apk.yml` — הגדירו משתנה ריפו `CAP_SERVER_URL`,
   ו-APK יופיע תחת Actions → Artifacts אחרי כל push ל-main.

* ללא כתובת שרת: האפליקציה מציגה מסך הסבר (`mobile-shell/index.html`).
* ללא רשת: `mobile-shell/offline.html`.
* אייקון: `resources/icon.svg` → `npm run android:icons`.
* כפתור "חזור" של אנדרואיד: סוגר מודאל → חוזר אחורה → יוצא (`src/components/MobileBridge.tsx`).
