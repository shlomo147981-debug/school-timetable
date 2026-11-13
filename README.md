# הצלצול 🔔 — מערכת שעות בית-ספרית (Next.js 15 + Supabase + Tailwind, RTL)

## הפעלה
```bash
npm install
cp .env.example .env.local   # מפתח service role — לסקריפט seed בלבד
# supabase/SETUP_ALL.sql → להדביק ב-Supabase SQL Editor
npm run seed                 # משתמשי דמו (אופציונלי)
npm run dev                  # http://localhost:3000
```
הכתובת והמפתח **הציבורי** של Supabase נמצאים ב-`.env.production` (ציבוריים ממילא — נצרבים לאפליקציה).
**כניסה:** מזהה משתמש + סיסמה (`t200` ← `t200@school.local` ב-Supabase Auth). אין הרשמה עצמית.

## ארכיטקטורה — אפליקציה סטטית ללא שרת
* `next build` מייצר אתר סטטי ב-`out/` (`output: 'export'`). אין SSR, Middleware או Server Actions.
* כל הקריאות והכתיבות נעשות **מהלקוח ישירות ל-Supabase** עם המפתח הציבורי + ה-JWT של המשתמש.
  האבטחה כולה ב-RLS (ראו למטה) — הקוד בלקוח לא "סומך" על עצמו.
* **עמוד יחיד** (`/`), ניווט בפרמטרים: `/?page=requests`, `/?view=month&date=2026-11-10&child=…`.
  כך זה עובד גם בתוך Capacitor, שמחזיר `index.html` לכל נתיב ללא סיומת.
* הסשן נשמר ב-`localStorage` ומתרענן אוטומטית.

```
supabase/migrations/     0001_schema.sql, 0002_rls.sql, 0003_admin_timetable_editing.sql
                         (+ SETUP_ALL.sql מאוחד, SETUP_UPGRADE_0003.sql לשדרוג)
supabase/tests/          rls_scenarios.sql
scripts/seed.mjs         נתוני דמו (service role)
src/
  app/page.tsx           נקודת כניסה: AuthProvider → Login / Schedule / Requests
  lib/
    supabase/client.ts   לקוח Supabase יחיד (דפדפן / WebView)
    api.ts               login, reportException, addAssignment, changeLesson, submitRequest, resolveRequest
    context.ts           "מה מוצג" לפי תפקיד (כיתה / תלמיד / ילד נבחר)
    loadSchedule.ts      שאילתות (כפופות ל-RLS)
    schedule.ts          תבנית שבועית → מופעים + שינויים/חופשות
    dates.ts, types.ts
  components/
    AuthProvider.tsx, MobileBridge.tsx
    screens/             LoginScreen, AppShell, ScheduleScreen, RequestsScreen
    schedule/            Toolbar, Board, DayView, WeekView, MonthView, LessonCard
    modals/              TeacherQuickModal (הערה / משימה / שינוי מערכת), RequestModal
android/                 פרויקט Capacitor
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

## מנהל-על וניהול משתמשים
* `profiles.is_admin` — מנהל-על (שלמה יצחקי, `shlomo`) רואה ועורך הכל, ומקבל הרשאות מחנך בכל הכיתות.
* לשונית **"ניהול משתמשים"** (רק למנהל): יצירה/עריכה/מחיקה של תלמידים, מורים, מחנכים והורים, שיוך ילדים להורה, כיתות.
* יצירת משתמש נעשית ב-DB דרך `admin_create_user` / `admin_update_user` / `admin_delete_user` (SECURITY DEFINER,
  בודקות `is_admin()`), כך שהאפליקציה **אינה צריכה** את מפתח ה-service role.
* בדיקות: `supabase/tests/admin_scenarios.sql` (24) + `rls_scenarios.sql` (26).

## עריכת מערכת (מחנך / מנהל)
* **לחיצה על שיעור → "עריכת שיעור"**: מקצוע, מורה, מורה שותף, שעות, חדר, הערה, ביטול.
  היקף: **"רק בתאריך הזה"** (`lesson_changes`) או **"כל שבוע"** (עדכון `lessons`).
* **➕** בכל יום: הוספת שיעור חד-פעמי או קבוע (אפשר גם שיעור אישי לתלמיד נבחר).
* **"מצב עריכה"**: סימון מרובה / "בחר יום שלם" → ביטול, הזזת זמנים (±דקות), פעילות מיוחדת (טיול/יום שיא), שחזור.

## עורך מסך מלא (1.3.0)
* כפתור **+ צף** (פינה שמאלית תחתונה) למחנך/מנהל, ולחיצה על שיעור → "עריכת השיעור", פותחים עורך בסגנון Google Calendar.
* פעולות: הוספת שיעור · שינוי שיעור · ביטול (שיעור אחד / כל היום / **שחרור מוקדם**) · פעילות מיוחדת (טיול / יום שיא / בחירה אישית).
* בחירת כיתה, "כל היום", תאריכים ושעות, תדירות (חד-פעמי / השבוע / כל ימי השבוע / קבוע), **צבע** ותיאור.
* שחרור מוקדם: מבטל את כל השיעורים מהשעה שנבחרה ומציג "סיום יום לימודים מוקדם בשעה XX:XX".
* צבע והערה קבועה דורשים את `supabase/SETUP_UPGRADE_0004.sql`; לפני ההרצה האפליקציה עובדת ופשוט לא שומרת אותם.

## מערכת פרטנית לתלמיד (1.4.0)
* בורר "תלמיד" בסרגל העליון → כל **+ / עריכה / −** חלים **רק על התלמיד** (חיווי סגול "שינוי פרטני עבור…").
  * הוספה → שיעור אישי (`lessons.student_id`).
  * שינוי/ביטול של שיעור כיתתי → דריסה פרטנית בטבלה `lesson_student_changes` (שאר הכיתה לא מושפעת).
    "קבוע / עד סוף השנה" = דריסה חוזרת שבועית (`until_date` = 30.6).
* כפתור **−** (מעל ה-+): מצב מחיקה — חד-פעמי / רק השבוע / קבוע עד סוף השנה.
* פרטיות (RLS, `0005`): פריטים אישיים גלויים רק לתלמיד, להוריו, למורה של השיעור, למורי אותו מקצוע בכיתה, למחנך ולמנהל.
  בדיקות: `supabase/tests/student_overrides_scenarios.sql` (21).

## עדכונים מרחוק (OTA) — GitHub Pages
* `.github/workflows/pages.yml` מפרסם את האתר הסטטי ל-`https://shlomo147981-debug.github.io/school-timetable/` בכל push.
* כל build כותב `version.json` (מספר build = זמן ה-commit).
* ה-APK מכיל גרסה מובנית מלאה. בפתיחה הוא בודק את `version.json` ב-Pages — אם יש גרסה חדשה יותר
  עובר אליה אוטומטית (כולל העברת ההתחברות). אין רשת → נשאר בגרסה המובנית (`public/offline.html` כגיבוי).
* ⚙️ בכותרת: מספר גרסה + **"בדוק עדכוני גרסה"** + "עדכן עכשיו".
* הפעלה חד-פעמית: **Settings → Pages → Source: GitHub Actions**. בחשבון GitHub חינמי Pages עובד רק במאגר **ציבורי**.

## אפליקציית אנדרואיד (Capacitor) — עצמאית
ה-APK מכיל את כל האפליקציה (`out/`) ומדבר ישירות עם Supabase מהטלפון. אין שרת.

```bash
npm run android:apk    # next build → cap sync → gradlew assembleDebug
```
פלט: `android/app/build/outputs/apk/debug/app-debug.apk` (דורש JDK 21 + Android SDK ו-`ANDROID_HOME`).

* בענן: `.github/workflows/android-apk.yml` בונה APK בכל push ל-main → Actions → Artifacts.
* Live reload בפיתוח: `CAP_DEV_URL=http://<IP>:3000 npx cap run android`.
* אייקון: `resources/icon.svg` → `npm run android:icons`.
* כפתור "חזור": סוגר מודאל → חוזר אחורה → יוצא (`src/components/MobileBridge.tsx`).
