-- =====================================================================
-- 0002_rls.sql — Row Level Security
--
-- עיקרון: כל פונקציות העזר יושבות בסכמה `private` שאינה חשופה ל-PostgREST
-- (לא ניתן לקרוא להן כ-RPC מהדפדפן), והן SECURITY DEFINER כדי למנוע
-- רקורסיה בין מדיניות של טבלאות שונות. כל פונקציה עונה רק על שאלות
-- לגבי המשתמש המחובר (auth.uid()).
--
-- הבטחה מרכזית להורים:
--   הורה רואה תלמיד  <=> קיימת שורה parent_children(parent_id = אני, student_id = התלמיד)
--   הורה רואה כיתה   <=> אחד מילדיו לומד בה (מערכת כיתתית, מבחנים, אירועים)
--   הורה לעולם לא רואה student_events / requests / profile של תלמיד אחר.
-- =====================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- פונקציות עזר ----------------------------------------------

create or replace function private.my_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('teacher', 'homeroom') from profiles where id = auth.uid()), false)
$$;

create or replace function private.student_class(p_student uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from profiles where id = p_student and role = 'student'
$$;

create or replace function private.lesson_class(p_lesson uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from lessons where id = p_lesson
$$;

create or replace function private.is_parent_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_children where parent_id = auth.uid() and student_id = p_student)
$$;

-- מחנך = מוגדר כ-homeroom_teacher של הכיתה ובעל תפקיד homeroom
create or replace function private.is_homeroom_of(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classes c join profiles p on p.id = c.homeroom_teacher_id
    where c.id = p_class and c.homeroom_teacher_id = auth.uid() and p.role = 'homeroom'
  )
$$;

-- מורה מלמד בכיתה: בעל שיעור קבוע בה, או משובץ כמחליף באחד משיעוריה
create or replace function private.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_staff() and (
    exists (select 1 from lessons where class_id = p_class and teacher_id = auth.uid())
    or exists (select 1 from lesson_changes lc join lessons l on l.id = lc.lesson_id
               where l.class_id = p_class and lc.substitute_teacher_id = auth.uid())
    or private.is_homeroom_of(p_class)
  )
$$;

-- רשאי לדווח על מופע שיעור: המורה הקבוע, המחליף באותו תאריך, או מחנך הכיתה
create or replace function private.can_report_on(p_lesson uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_staff() and (
    exists (select 1 from lessons where id = p_lesson and teacher_id = auth.uid())
    or exists (select 1 from lesson_changes where lesson_id = p_lesson and change_date = p_date
               and substitute_teacher_id = auth.uid())
    or private.is_homeroom_of(private.lesson_class(p_lesson))
  )
$$;

create or replace function private.can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_student = auth.uid()
      or private.is_parent_of(p_student)
      or private.teaches_class(private.student_class(p_student))
$$;

create or replace function private.can_view_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- תלמיד בכיתה
    exists (select 1 from profiles where id = auth.uid() and role = 'student' and class_id = p_class)
    -- הורה לתלמיד בכיתה
    or exists (select 1 from parent_children pc join profiles s on s.id = pc.student_id
               where pc.parent_id = auth.uid() and s.class_id = p_class)
    -- צוות המלמד בכיתה / מחנך
    or private.teaches_class(p_class)
$$;

-- גרסת טקסט בטוחה ל-Storage (שם תיקייה שאינו UUID => false, לא שגיאה)
create or replace function private.can_view_student_text(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then private.can_view_student(p::uuid) else false end
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------- הפעלת RLS על כל הטבלאות ----------------------------------
alter table public.classes          enable row level security;
alter table public.profiles         enable row level security;
alter table public.parent_children  enable row level security;
alter table public.lessons          enable row level security;
alter table public.lesson_changes   enable row level security;
alter table public.calendar_events  enable row level security;
alter table public.assignments      enable row level security;
alter table public.student_events   enable row level security;
alter table public.student_requests enable row level security;

-- אנונימיים: ללא גישה כלל
revoke all on all tables in schema public from anon;

-- ---------- classes ---------------------------------------------------
create policy classes_select on public.classes for select to authenticated
  using (private.can_view_class(id));
-- יצירה/מחיקה של כיתות = ניהול מערכת (service role) בלבד

-- ---------- profiles --------------------------------------------------
-- אין מדיניות INSERT/UPDATE/DELETE => משתמש לא יכול לשנות לעצמו role/class_id.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or role in ('teacher', 'homeroom')                                -- שמות מורים גלויים לכולם
    or (role = 'student' and private.can_view_student(id))            -- הורה: רק ילדיו. תלמיד: רק עצמו
    or (role = 'parent' and private.is_staff() and exists (            -- צוות רואה הורי תלמידיו
          select 1 from public.parent_children pc
          where pc.parent_id = profiles.id and private.can_view_student(pc.student_id)))
  );

-- ---------- parent_children -------------------------------------------
create policy parent_children_select on public.parent_children for select to authenticated
  using (
    parent_id = auth.uid()
    or student_id = auth.uid()
    or (private.is_staff() and private.can_view_student(student_id))
  );

-- ---------- lessons ---------------------------------------------------
create policy lessons_select on public.lessons for select to authenticated
  using (
    case when student_id is null
         then private.can_view_class(class_id)
         else private.can_view_student(student_id)   -- שיעור אישי: רק התלמיד, הוריו וצוות הכיתה
    end
  );

create policy lessons_insert on public.lessons for insert to authenticated
  with check (
    private.is_homeroom_of(class_id)
    and (student_id is null or private.student_class(student_id) = class_id)
  );
create policy lessons_update on public.lessons for update to authenticated
  using (private.is_homeroom_of(class_id))
  with check (private.is_homeroom_of(class_id)
              and (student_id is null or private.student_class(student_id) = class_id));
create policy lessons_delete on public.lessons for delete to authenticated
  using (private.is_homeroom_of(class_id));

-- ---------- lesson_changes --------------------------------------------
create policy lesson_changes_select on public.lesson_changes for select to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id)); -- יורש את RLS של lessons
create policy lesson_changes_write on public.lesson_changes for all to authenticated
  using (private.is_homeroom_of(private.lesson_class(lesson_id)))
  with check (private.is_homeroom_of(private.lesson_class(lesson_id)));

-- ---------- calendar_events -------------------------------------------
create policy calendar_select on public.calendar_events for select to authenticated
  using (class_id is null or private.can_view_class(class_id));
create policy calendar_write on public.calendar_events for all to authenticated
  using (class_id is not null and private.is_homeroom_of(class_id))
  with check (class_id is not null and private.is_homeroom_of(class_id));

-- ---------- assignments (גלוי לכל הכיתה) ------------------------------
create policy assignments_select on public.assignments for select to authenticated
  using (private.can_view_class(class_id));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      private.is_homeroom_of(class_id)
      -- מורה מקצועי: רק בשיעור שלו (קבוע, או כמחליף) ורק לכיתה של אותו שיעור
      or (lesson_id is not null
          and private.lesson_class(lesson_id) = class_id
          and (exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = auth.uid())
               or exists (select 1 from public.lesson_changes lc
                          where lc.lesson_id = assignments.lesson_id
                            and lc.substitute_teacher_id = auth.uid())))
    )
  );
create policy assignments_modify on public.assignments for update to authenticated
  using (created_by = auth.uid() or private.is_homeroom_of(class_id))
  with check (created_by = auth.uid() or private.is_homeroom_of(class_id));
create policy assignments_delete on public.assignments for delete to authenticated
  using (created_by = auth.uid() or private.is_homeroom_of(class_id));

-- ---------- student_events (פרטי!) ------------------------------------
create policy student_events_select on public.student_events for select to authenticated
  using (
    student_id = auth.uid()                                         -- התלמיד עצמו
    or private.is_parent_of(student_id)                             -- הוריו בלבד
    or reporter_id = auth.uid()                                     -- המורה שדיווח
    or private.can_report_on(lesson_id, lesson_date)                -- מורה השיעור / מחליף
    or private.is_homeroom_of(private.student_class(student_id))    -- מבט-על למחנך
  );
create policy student_events_insert on public.student_events for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and private.can_report_on(lesson_id, lesson_date)
    and private.student_class(student_id) = private.lesson_class(lesson_id)
    and extract(dow from lesson_date)::int + 1 =
        (select day_of_week from public.lessons where id = lesson_id)
  );
create policy student_events_update on public.student_events for update to authenticated
  using (reporter_id = auth.uid() or private.is_homeroom_of(private.student_class(student_id)))
  with check (reporter_id = auth.uid() or private.is_homeroom_of(private.student_class(student_id)));
create policy student_events_delete on public.student_events for delete to authenticated
  using (reporter_id = auth.uid() or private.is_homeroom_of(private.student_class(student_id)));

-- ---------- student_requests ------------------------------------------
create policy requests_select on public.student_requests for select to authenticated
  using (
    student_id = auth.uid()
    or private.is_parent_of(student_id)
    or teacher_id = auth.uid()
    or private.is_homeroom_of(private.student_class(student_id))
  );
create policy requests_insert on public.student_requests for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'open'
    and (student_id = auth.uid() or private.is_parent_of(student_id))
    -- אם הבקשה מקושרת לאירוע — חייב להיות אירוע של אותו תלמיד
    and (event_id is null or exists (select 1 from public.student_events e
                                     where e.id = event_id and e.student_id = student_requests.student_id))
    and exists (select 1 from public.profiles t where t.id = teacher_id and t.role in ('teacher', 'homeroom'))
  );
create policy requests_resolve on public.student_requests for update to authenticated
  using (teacher_id = auth.uid() or private.is_homeroom_of(private.student_class(student_id)))
  with check (teacher_id = auth.uid() or private.is_homeroom_of(private.student_class(student_id)));

-- המורה יכול לעדכן רק את שדות ההכרעה (column-level privileges)
revoke update on public.student_requests from authenticated;
grant update (status, response) on public.student_requests to authenticated;

-- ---------- Storage: צרופות לבקשות -----------------------------------
-- מבנה נתיב: request-attachments/<student_id>/<uuid>-<filename>
insert into storage.buckets (id, name, public)
values ('request-attachments', 'request-attachments', false)
on conflict (id) do nothing;

create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or (private.my_role() = 'parent'
             and private.can_view_student_text((storage.foldername(name))[1])))
  );
create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'request-attachments'
    and private.can_view_student_text((storage.foldername(name))[1])
  );
