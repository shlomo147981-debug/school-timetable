-- SETUP_ALL.sql — התקנה חדשה מאפס (0001–0007). להדבקה ב-SQL Editor.
begin;

-- =====================================================================
-- 0001_schema.sql — טבלאות, טיפוסים וטריגרים
-- =====================================================================
create extension if not exists pgcrypto;

create type public.user_role         as enum ('teacher', 'homeroom', 'student', 'parent');
create type public.exception_type    as enum ('absence', 'late', 'missing_equipment', 'misbehavior', 'praise');
create type public.exception_status  as enum ('pending_justification', 'justified', 'unjustified');
create type public.assignment_type   as enum ('homework', 'exam', 'quiz', 'event');
create type public.lesson_change_kind as enum ('cancelled', 'substitute', 'moved', 'room_change');
create type public.calendar_kind     as enum ('holiday', 'trip', 'event');
create type public.request_kind      as enum ('justify_absence', 'appeal_note', 'other');
create type public.request_status    as enum ('open', 'approved', 'rejected');

-- ---------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------
create table public.classes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,                -- למשל "ט'2"
  grade               smallint,
  homeroom_teacher_id uuid,                         -- FK מוגדר אחרי profiles
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Users (profiles) — 1:1 מול auth.users
-- username = "מזהה משתמש ייחודי" שאיתו מתחברים
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  full_name  text not null,
  role       public.user_role not null,
  class_id   uuid references public.classes (id) on delete set null, -- תלמיד: הכיתה שלו; מחנך: הכיתה שהוא מחנך
  created_at timestamptz not null default now()
);

alter table public.classes
  add constraint classes_homeroom_teacher_id_fkey
  foreign key (homeroom_teacher_id) references public.profiles (id) on delete set null;

-- במקום parent_of (מערך) — טבלת קשר. מאפשרת FK אמיתי, אינדקס,
-- ומדיניות RLS פשוטה ומהירה. (מעבר בין אחים = כמה שורות לאותו הורה.)
create table public.parent_children (
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (parent_id, student_id)
);
create index on public.parent_children (student_id);

-- ---------------------------------------------------------------------
-- Schedule / Lessons — תבנית שבועית חוזרת
-- student_id != null  => שיעור אישי (פרטני / תגבור)
-- specific_date != null => שיעור חד-פעמי (תוספת שיעור ע"י המחנך)
-- ---------------------------------------------------------------------
create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  teacher_id    uuid not null references public.profiles (id),
  student_id    uuid references public.profiles (id) on delete cascade,
  subject       text not null,
  room          text,
  day_of_week   smallint not null check (day_of_week between 1 and 5), -- 1=ראשון ... 5=חמישי
  start_time    time not null,
  end_time      time not null,
  specific_date date,
  valid_from    date,
  valid_to      date,
  created_at    timestamptz not null default now(),
  check (end_time > start_time),
  -- תאריך חד-פעמי חייב ליפול על ראשון-חמישי ולהתאים ל-day_of_week
  check (specific_date is null or extract(dow from specific_date)::int + 1 = day_of_week)
);
create index on public.lessons (class_id, day_of_week);
create index on public.lessons (teacher_id);
create index on public.lessons (student_id);

-- שינויים נקודתיים לשיעור בתאריך מסוים (ביטול, מחליף, הזזה, החלפת חדר)
create table public.lesson_changes (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             uuid not null references public.lessons (id) on delete cascade,
  change_date           date not null,
  kind                  public.lesson_change_kind not null,
  substitute_teacher_id uuid references public.profiles (id),
  new_start_time        time,
  new_end_time          time,
  new_room              text,
  note                  text,
  created_by            uuid not null default auth.uid() references public.profiles (id),
  created_at            timestamptz not null default now(),
  unique (lesson_id, change_date),
  check (kind <> 'substitute' or substitute_teacher_id is not null),
  check (extract(dow from change_date) between 0 and 4)
);

-- טיולים / חופשות / אירועים (class_id null = כלל בית-ספרי)
create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid references public.classes (id) on delete cascade,
  kind       public.calendar_kind not null,
  title      text not null,
  start_date date not null,
  end_date   date not null,
  created_by uuid default auth.uid() references public.profiles (id),
  check (end_date >= start_date)
);
create index on public.calendar_events (class_id, start_date);

-- ---------------------------------------------------------------------
-- Assignments & Exams — גלוי לכל הכיתה
-- ---------------------------------------------------------------------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references public.lessons (id) on delete set null,
  class_id    uuid not null references public.classes (id) on delete cascade,
  type        public.assignment_type not null,
  title       text not null,
  due_date    date not null,
  description text,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index on public.assignments (class_id, due_date);

-- ---------------------------------------------------------------------
-- Events & Attendance Exceptions — "ניהול לפי חריגים", פרטי לתלמיד/הורים
-- ---------------------------------------------------------------------
create table public.student_events (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  lesson_date date not null,                       -- המופע הספציפי של השיעור
  student_id  uuid not null references public.profiles (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id),
  type        public.exception_type not null,
  note        text,
  status      public.exception_status,             -- רלוונטי רק ל-absence / late
  retracted   boolean not null default false,      -- הערה שבוטלה בעקבות ערעור מאושר
  created_at  timestamptz not null default now()   -- = timestamp ב-PRD
);
create index on public.student_events (student_id, lesson_date);
create index on public.student_events (lesson_id, lesson_date);

-- ---------------------------------------------------------------------
-- בקשות תלמיד/הורה למורה (הצדקת חיסור, ערעור על הערה, אחר)
-- ---------------------------------------------------------------------
create table public.student_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  created_by      uuid not null default auth.uid() references public.profiles (id),
  teacher_id      uuid not null references public.profiles (id),
  event_id        uuid references public.student_events (id) on delete cascade,
  lesson_id       uuid references public.lessons (id) on delete set null,
  lesson_date     date,
  kind            public.request_kind not null,
  message         text not null,
  attachment_path text,                             -- נתיב ב-Storage: <student_id>/<file>
  status          public.request_status not null default 'open',
  response        text,
  resolved_by     uuid references public.profiles (id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.student_requests (teacher_id, status);
create index on public.student_requests (student_id);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- סטטוס ברירת מחדל: חיסור/איחור => ממתין להצדקה; אחרים => null
create function public.student_events_default_status()
returns trigger language plpgsql as $$
begin
  if new.type in ('absence', 'late') then
    new.status := coalesce(new.status, 'pending_justification');
  else
    new.status := null;
  end if;
  return new;
end $$;

create trigger trg_student_events_status
  before insert on public.student_events
  for each row execute function public.student_events_default_status();

-- בעת הכרעה בבקשה: עדכון האירוע המקושר (security definer כי המורה
-- המכריע אינו בהכרח המדווח המקורי — ההרשאה נבדקה כבר ב-RLS של הבקשה)
create function public.student_requests_on_resolve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'open' then
    new.resolved_by := auth.uid();
    new.resolved_at := now();

    if new.event_id is not null then
      if new.kind = 'justify_absence' then
        update public.student_events
           set status = case when new.status = 'approved'
                             then 'justified'::exception_status
                             else 'unjustified'::exception_status end
         where id = new.event_id and type in ('absence', 'late');
      elsif new.kind = 'appeal_note' and new.status = 'approved' then
        update public.student_events set retracted = true where id = new.event_id;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_student_requests_resolve
  before update on public.student_requests
  for each row execute function public.student_requests_on_resolve();

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

-- =====================================================================
-- 0003_admin_timetable_editing.sql
--   1. מנהל-על (is_admin) + פונקציות ניהול משתמשים (RPC) + RLS למנהל
--   2. כיתה ח1: שלמה יצחקי (מחנך + מנהל), המורים, ומערכת השעות האמיתית
--   3. עריכת מערכת: מורה שותף, תווית מורה, שינוי מקצוע חד-פעמי, סוג "modified"
-- בטוח להרצה חוזרת (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- סכמה
-- ---------------------------------------------------------------------
alter type public.lesson_change_kind add value if not exists 'modified';

alter table public.profiles       add column if not exists is_admin boolean not null default false;
alter table public.lessons        alter column teacher_id drop not null;   -- פעילות ללא מורה מוגדר
alter table public.lessons        add column if not exists co_teacher_id uuid;
alter table public.lessons        add column if not exists teacher_label text; -- טקסט חופשי לתצוגה
alter table public.lesson_changes add column if not exists new_subject text;

-- מפתחות זרים: מחיקת משתמש לא תיחסם בגלל היסטוריה (מדווח/יוצר → null)
alter table public.student_events   alter column reporter_id drop not null;
alter table public.assignments      alter column created_by  drop not null;
alter table public.lesson_changes   alter column created_by  drop not null;
alter table public.student_requests alter column created_by  drop not null;

do $$
declare r record;
begin
  for r in select * from (values
      ('lessons',          'teacher_id',            'set null'),
      ('lessons',          'co_teacher_id',         'set null'),
      ('lesson_changes',   'substitute_teacher_id', 'cascade'),
      ('lesson_changes',   'created_by',            'set null'),
      ('calendar_events',  'created_by',            'set null'),
      ('assignments',      'created_by',            'set null'),
      ('student_events',   'reporter_id',           'set null'),
      ('student_requests', 'teacher_id',            'cascade'),
      ('student_requests', 'created_by',            'set null'),
      ('student_requests', 'resolved_by',           'set null')
    ) as t(tbl, col, action)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_fkey');
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete %s',
                   r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.action);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- פונקציות עזר (מעודכנות) — מנהל-על מקבל הרשאות מחנך בכל הכיתות
-- ---------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('teacher', 'homeroom') or is_admin from profiles where id = auth.uid()), false)
$$;

create or replace function private.is_homeroom_of(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_admin() or exists (
    select 1 from classes c join profiles p on p.id = c.homeroom_teacher_id
    where c.id = p_class and c.homeroom_teacher_id = auth.uid() and p.role = 'homeroom'
  )
$$;

create or replace function private.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_staff() and (
    exists (select 1 from lessons where class_id = p_class and (teacher_id = auth.uid() or co_teacher_id = auth.uid()))
    or exists (select 1 from lesson_changes lc join lessons l on l.id = lc.lesson_id
               where l.class_id = p_class and lc.substitute_teacher_id = auth.uid())
    or private.is_homeroom_of(p_class)
  )
$$;

create or replace function private.can_report_on(p_lesson uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_staff() and (
    exists (select 1 from lessons where id = p_lesson and (teacher_id = auth.uid() or co_teacher_id = auth.uid()))
    or exists (select 1 from lesson_changes where lesson_id = p_lesson and change_date = p_date
               and substitute_teacher_id = auth.uid())
    or private.is_homeroom_of(private.lesson_class(p_lesson))
  )
$$;

create or replace function private.can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_student = auth.uid()
      or private.is_admin()
      or private.is_parent_of(p_student)
      or private.teaches_class(private.student_class(p_student))
$$;

-- ---------------------------------------------------------------------
-- RLS — תוספות למנהל-על
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or private.is_admin()
    or role in ('teacher', 'homeroom')
    or (role = 'student' and private.can_view_student(id))
    or (role = 'parent' and private.is_staff() and exists (
          select 1 from public.parent_children pc
          where pc.parent_id = profiles.id and private.can_view_student(pc.student_id)))
  );

-- מנהל: עדכון/מחיקה ישירים של פרופילים (יצירה — רק דרך admin_create_user)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (private.is_admin() and id <> auth.uid());

drop policy if exists parent_children_admin on public.parent_children;
create policy parent_children_admin on public.parent_children for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- משימות: גם מורה שותף רשאי
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      private.is_homeroom_of(class_id)
      or (lesson_id is not null
          and private.lesson_class(lesson_id) = class_id
          and (exists (select 1 from public.lessons l where l.id = lesson_id
                       and (l.teacher_id = auth.uid() or l.co_teacher_id = auth.uid()))
               or exists (select 1 from public.lesson_changes lc
                          where lc.lesson_id = assignments.lesson_id
                            and lc.substitute_teacher_id = auth.uid())))
    )
  );

-- ---------------------------------------------------------------------
-- ניהול משתמשים (RPC). יצירת משתמש Auth ישירות ב-DB — כך אין צורך
-- במפתח service role בתוך האפליקציה. כל פונקציה בודקת is_admin().
-- ---------------------------------------------------------------------
create or replace function private.login_email(p_username text)
returns text language sql immutable as $$
  select lower(trim(p_username)) || '@school.local'   -- תואם NEXT_PUBLIC_LOGIN_DOMAIN
$$;

create or replace function private.create_auth_user(p_username text, p_password text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := private.login_email(p_username);
begin
  if lower(trim(p_username)) !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'שם משתמש לא תקין (3-32 תווים: אותיות באנגלית, ספרות, . _ -)' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'הסיסמה חייבת להכיל לפחות 6 תווים' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'שם המשתמש "%" כבר קיים', p_username using errcode = '23505';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  return v_id;
end $$;

create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_admin() then
    raise exception 'אין הרשאה — פעולה למנהל מערכת בלבד' using errcode = '42501';
  end if;
end $$;

create or replace function private.set_children(p_parent uuid, p_children uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from parent_children where parent_id = p_parent;
  insert into parent_children (parent_id, student_id)
  select p_parent, s.id from profiles s where s.id = any(coalesce(p_children, '{}')) and s.role = 'student'
  on conflict do nothing;
end $$;

create or replace function public.admin_create_user(
  p_username text, p_password text, p_full_name text, p_role public.user_role,
  p_class_id uuid default null, p_children uuid[] default '{}', p_is_admin boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if coalesce(trim(p_full_name), '') = '' then raise exception 'יש להזין שם מלא' using errcode = '22023'; end if;
  if p_role = 'student' and p_class_id is null then raise exception 'יש לבחור כיתה לתלמיד' using errcode = '22023'; end if;

  v_id := private.create_auth_user(p_username, p_password);
  insert into profiles (id, username, full_name, role, class_id, is_admin)
  values (v_id, lower(trim(p_username)), trim(p_full_name), p_role,
          case when p_role in ('student', 'homeroom') then p_class_id end, coalesce(p_is_admin, false));

  if p_role = 'parent' then perform private.set_children(v_id, p_children); end if;
  if p_role = 'homeroom' and p_class_id is not null then
    update classes set homeroom_teacher_id = v_id where id = p_class_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_update_user(
  p_id uuid, p_full_name text, p_role public.user_role, p_class_id uuid default null,
  p_password text default null, p_children uuid[] default null, p_is_admin boolean default null)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  perform private.require_admin();
  if p_id = auth.uid() and p_is_admin is false then
    raise exception 'לא ניתן להסיר הרשאת מנהל מעצמך' using errcode = '22023';
  end if;
  if p_role = 'student' and p_class_id is null then raise exception 'יש לבחור כיתה לתלמיד' using errcode = '22023'; end if;

  update profiles set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    role      = p_role,
    class_id  = case when p_role in ('student', 'homeroom') then p_class_id end,
    is_admin  = coalesce(p_is_admin, is_admin)
  where id = p_id;
  if not found then raise exception 'המשתמש לא נמצא' using errcode = 'P0002'; end if;

  -- מחנך: שיוך לכיתה אחת בלבד
  update classes set homeroom_teacher_id = null
   where homeroom_teacher_id = p_id and (p_role <> 'homeroom' or id is distinct from p_class_id);
  if p_role = 'homeroom' and p_class_id is not null then
    update classes set homeroom_teacher_id = p_id where id = p_class_id;
  end if;

  if p_role = 'parent' and p_children is not null then perform private.set_children(p_id, p_children); end if;
  if p_role <> 'parent' then delete from parent_children where parent_id = p_id; end if;

  if coalesce(p_password, '') <> '' then
    if length(p_password) < 6 then raise exception 'הסיסמה חייבת להכיל לפחות 6 תווים' using errcode = '22023'; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.admin_delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform private.require_admin();
  if p_id = auth.uid() then raise exception 'לא ניתן למחוק את המשתמש של עצמך' using errcode = '22023'; end if;
  delete from auth.users where id = p_id;   -- מוחק בשרשרת: profile, קישורי הורה, שיעורים אישיים
end $$;

revoke all on function public.admin_create_user(text, text, text, public.user_role, uuid, uuid[], boolean) from public, anon;
revoke all on function public.admin_update_user(uuid, text, public.user_role, uuid, text, uuid[], boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_create_user(text, text, text, public.user_role, uuid, uuid[], boolean) to authenticated;
grant execute on function public.admin_update_user(uuid, text, public.user_role, uuid, text, uuid[], boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
-- פונקציות פנימיות שיוצרות משתמשים — רק דרך admin_* (security definer), לא ישירות
revoke execute on function private.create_auth_user(text, text) from authenticated;
revoke execute on function private.set_children(uuid, uuid[]) from authenticated;

-- ---------------------------------------------------------------------
-- כיתה ח1: שלמה יצחקי (מחנך + מנהל-על), מורים, ומערכת שעות
-- ---------------------------------------------------------------------
create or replace function private.ensure_user(p_username text, p_full_name text, p_role public.user_role,
                                               p_class uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from profiles where username = p_username;
  if v_id is null then
    v_id := private.create_auth_user(p_username, 'Demo1234!');
    insert into profiles (id, username, full_name, role, class_id) values (v_id, p_username, p_full_name, p_role, p_class);
  end if;
  return v_id;
end $$;
revoke execute on function private.ensure_user(text, text, public.user_role, uuid) from public, authenticated;

do $$
declare
  v_class uuid;
  v_shlomo uuid;
begin
  select id into v_class from classes where name = 'ח1';
  if v_class is null then
    insert into classes (name, grade) values ('ח1', 8) returning id into v_class;
  end if;

  v_shlomo := private.ensure_user('shlomo', 'שלמה יצחקי', 'homeroom', v_class);
  update profiles set role = 'homeroom', class_id = v_class, is_admin = true where id = v_shlomo;
  update classes set homeroom_teacher_id = v_shlomo where id = v_class;

  perform private.ensure_user('tzofia', 'צופיה',      'teacher');
  perform private.ensure_user('hadasa', 'הדסה',       'teacher');
  perform private.ensure_user('odelia', 'אודליה סיני', 'teacher');
  perform private.ensure_user('naama',  'נעמה',       'teacher');
  perform private.ensure_user('ravit',  'רווית',      'teacher');
  perform private.ensure_user('anat',   'ענת גבאי',   'teacher');
  perform private.ensure_user('alisa',  'עליסה',      'teacher');

  -- המערכת נטענת רק אם לכיתה עדיין אין שיעורים (לא דורס עריכות של המחנך)
  if not exists (select 1 from lessons where class_id = v_class) then
    insert into lessons (class_id, day_of_week, start_time, end_time, subject, teacher_id, co_teacher_id)
    select v_class, t.day, p.s, p.e, t.subject,
           (select id from profiles where username = t.teacher),
           (select id from profiles where username = t.co_teacher)
    from (values
      -- שעה 0: בוקר טוב, א'-ה'
      (1,0,'בוקר טוב','shlomo',null),(2,0,'בוקר טוב','shlomo',null),(3,0,'בוקר טוב','shlomo',null),
      (4,0,'בוקר טוב','shlomo',null),(5,0,'בוקר טוב','shlomo',null),
      -- ראשון
      (1,1,'מתמטיקה עמ"ט','tzofia','hadasa'),(1,2,'מתמטיקה עמ"ט','tzofia','hadasa'),
      (1,3,'רצועות רוחב / פיזיקה עמ"ט',null,null),(1,4,'רצועות רוחב / פיזיקה עמ"ט',null,null),
      (1,5,'אנגלית',null,null),(1,6,'אנגלית',null,null),(1,7,'אסטרטגיית למידה / מדעים',null,null),
      -- שני
      (2,1,'חינוך גופני',null,null),(2,2,'עברית','odelia',null),
      (2,3,'מתמטיקה עמ"ט','tzofia','hadasa'),(2,4,'מתמטיקה עמ"ט','tzofia','hadasa'),
      (2,5,'של"ח',null,null),(2,6,'מדעי כדור הארץ','ravit',null),
      -- שלישי
      (3,1,'בית מדרש','shlomo',null),(3,2,'חינוך','shlomo',null),
      (3,3,'מדעים','ravit',null),(3,4,'מדעים','ravit',null),
      (3,5,'סייבר',null,null),(3,6,'סייבר',null,null),(3,7,'אנגלית',null,null),(3,8,'אנגלית',null,null),
      -- רביעי
      (4,1,'רצועות רוחב / מתמטיקה עמ"ט',null,null),(4,2,'רצועות רוחב / מתמטיקה עמ"ט',null,null),
      (4,3,'עברית','odelia',null),(4,4,'עברית','odelia',null),
      (4,5,'כישורי חיים','anat',null),(4,6,'חינוך גופני',null,null),
      -- חמישי
      (5,1,'מקרא',null,null),(5,2,'היסטוריה','naama',null),(5,3,'מקרא',null,null),(5,4,'מקרא',null,null),
      (5,5,'בית מדרש',null,null),(5,6,'מתמטיקה','alisa',null),(5,7,'מתמטיקה עמ"ט','tzofia','hadasa')
    ) as t(day, period, subject, teacher, co_teacher)
    join (values
      (0, time '08:15', time '08:30'), (1, '08:30', '09:15'), (2, '09:15', '10:00'),
      (3, '10:25', '11:10'), (4, '11:10', '11:50'), (5, '12:10', '12:55'),
      (6, '12:55', '13:40'), (7, '13:55', '14:40'), (8, '14:40', '15:20')
    ) as p(period, s, e) on p.period = t.period;
  end if;
end $$;

-- =====================================================================
-- (אופציונלי) מחיקת נתוני הדמו הישנים (ט'2, ז'1 והמשתמשים h100/t200/...).
-- הסירו את סימני ההערה כדי להריץ:
-- delete from auth.users where email in ('h100@school.local','t200@school.local','t201@school.local',
--   's300@school.local','s301@school.local','s302@school.local','s303@school.local','p400@school.local');
-- delete from public.classes where name in ('ט''2', 'ז''1');
-- =====================================================================

-- =====================================================================
-- 0004_colors_notes.sql — גרסה 1.3.0
--   צבע תצוגה לשיעור/אירוע + תיאור/הערה קבועה לשיעור.
--   (האפליקציה עובדת גם לפני ההרצה — רק הצבע וההערה הקבועה לא יישמרו עד אז.)
-- בטוח להרצה חוזרת.
-- =====================================================================
alter table public.lessons        add column if not exists color text;
alter table public.lessons        add column if not exists note  text;
alter table public.lesson_changes add column if not exists new_color text;

alter table public.lessons        drop constraint if exists lessons_color_check;
alter table public.lessons        add  constraint lessons_color_check        check (color is null or color ~ '^[a-z]{3,10}$');
alter table public.lesson_changes drop constraint if exists lesson_changes_new_color_check;
alter table public.lesson_changes add  constraint lesson_changes_new_color_check check (new_color is null or new_color ~ '^[a-z]{3,10}$');

-- =====================================================================
-- 0005_student_overrides.sql — גרסה 1.4.0: מערכת פרטנית לתלמיד בודד
--
-- 1. טבלה חדשה lesson_student_changes: דריסה פרטנית של שיעור כיתתי לתלמיד אחד
--    (ביטול / שינוי / פעילות מיוחדת). שאר הכיתה ממשיכה לראות את השיעור הרגיל.
--    until_date = null  → רק בתאריך change_date
--    until_date = תאריך → חוזר כל שבוע (באותו שיעור) מ-change_date ועד until_date ("עד סוף השנה")
--    (טבלה נפרדת ולא עמודה ב-lesson_changes — כדי לא לשבור גרסאות קודמות של האפליקציה.)
--
-- 2. פרטיות: שיעור אישי (lessons.student_id) ודריסה פרטנית גלויים רק ל:
--    התלמיד · הוריו (parent_children) · המורה של השיעור (כולל שותף) ·
--    מורים שמלמדים את אותו מקצוע בכיתה · מחנך הכיתה · מנהל-על.
--    מוסתרים לחלוטין משאר התלמידים וההורים — ומשאר המורים.
-- בטוח להרצה חוזרת.
-- =====================================================================

create table if not exists public.lesson_student_changes (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             uuid not null references public.lessons (id) on delete cascade,
  student_id            uuid not null references public.profiles (id) on delete cascade,
  change_date           date not null,
  until_date            date,
  kind                  public.lesson_change_kind not null,
  substitute_teacher_id uuid references public.profiles (id) on delete set null,
  new_start_time        time,
  new_end_time          time,
  new_room              text,
  new_subject           text,
  new_color             text check (new_color is null or new_color ~ '^[a-z]{3,10}$'),
  note                  text,
  created_by            uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (lesson_id, student_id, change_date),
  check (until_date is null or until_date >= change_date),
  check (kind <> 'substitute' or substitute_teacher_id is not null)
);
create index if not exists lesson_student_changes_student_idx on public.lesson_student_changes (student_id, change_date);
create index if not exists lesson_student_changes_lesson_idx  on public.lesson_student_changes (lesson_id);

-- ---------------------------------------------------------------------
-- פונקציות עזר
-- ---------------------------------------------------------------------

-- המשתמש מלמד את המקצוע הזה בכיתה (שיעור כיתתי קבוע, כמורה או כמורה שותף)
create or replace function private.teaches_subject_in_class(p_class uuid, p_subject text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lessons
    where class_id = p_class and subject = p_subject and student_id is null
      and (teacher_id = auth.uid() or co_teacher_id = auth.uid())
  )
$$;

-- מי רשאי לראות פריט פרטני של תלמיד (שיעור אישי / דריסה פרטנית)
create or replace function private.can_view_personal(
  p_student uuid, p_class uuid, p_subject text, p_teacher uuid, p_co uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_student = auth.uid()                                   -- התלמיד עצמו
      or private.is_parent_of(p_student)                          -- הוריו
      or private.is_homeroom_of(p_class)                          -- מחנך הכיתה + מנהל-על
      or (private.is_staff() and (
            auth.uid() = p_teacher or auth.uid() = p_co            -- המורה של השיעור
            or private.teaches_subject_in_class(p_class, p_subject)))  -- מורי אותו מקצוע בכיתה
$$;

-- דריסה פרטנית: הרשאת צפייה לפי השיעור שהיא דורסת
create or replace function private.can_view_student_change(p_lesson uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select private.can_view_personal(p_student, l.class_id, l.subject, l.teacher_id, l.co_teacher_id)
    from lessons l where l.id = p_lesson
  ), false)
$$;

revoke all on function private.teaches_subject_in_class(uuid, text) from public;
revoke all on function private.can_view_personal(uuid, uuid, text, uuid, uuid) from public;
revoke all on function private.can_view_student_change(uuid, uuid) from public;
grant execute on function private.teaches_subject_in_class(uuid, text) to authenticated;
grant execute on function private.can_view_personal(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function private.can_view_student_change(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

-- שיעורים אישיים: הידוק — כבר לא כל מורה בכיתה, רק הרלוונטיים
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to authenticated
  using (
    case when student_id is null
         then private.can_view_class(class_id)
         else private.can_view_personal(student_id, class_id, subject, teacher_id, co_teacher_id)
    end
  );

alter table public.lesson_student_changes enable row level security;
revoke all on public.lesson_student_changes from anon;
grant select, insert, update, delete on public.lesson_student_changes to authenticated;

drop policy if exists student_changes_select on public.lesson_student_changes;
create policy student_changes_select on public.lesson_student_changes for select to authenticated
  using (private.can_view_student_change(lesson_id, student_id));

-- כתיבה: מחנך הכיתה / מנהל, ורק לתלמיד שלומד באותה כיתה
drop policy if exists student_changes_write on public.lesson_student_changes;
create policy student_changes_write on public.lesson_student_changes for all to authenticated
  using (private.is_homeroom_of(private.lesson_class(lesson_id)))
  with check (
    private.is_homeroom_of(private.lesson_class(lesson_id))
    and private.student_class(student_id) = private.lesson_class(lesson_id)
  );

commit;

-- 0006 מחוץ לטרנזקציה (הוספת ערך ל-enum)
-- =====================================================================
-- 0006_removed_kind.sql — גרסה 1.6.0
--   סוג שינוי חדש 'removed' = מחיקה מלאה: השיעור לא מוצג בכלל (לא "מבוטל" עם קו חוצה)
--   עבור מי שהמחיקה חלה עליו (כל הכיתה ב-lesson_changes, או תלמידים ב-lesson_student_changes).
--   האפליקציה עובדת גם לפני ההרצה (שומרת מחיקה בצורה תואמת) — אחרי ההרצה נשמר כסוג אמיתי.
-- בטוח להרצה חוזרת.
-- =====================================================================
alter type public.lesson_change_kind add value if not exists 'removed';
notify pgrst, 'reload schema';

-- =====================================================================
-- 0007_admin_school_events.sql — גרסה 1.8.0 (אופציונלי)
--   מנהל-על רשאי ליצור/לערוך/למחוק גם אירועים בית-ספריים (calendar_events עם class_id = null).
--   כל השאר כבר קיים: מחנך הכיתה ומנהל-על מוחקים הערות (student_events), אירועי כיתה
--   (calendar_events), מבחנים/משימות (assignments) ושינויים (lesson_changes / lesson_student_changes)
--   — גם כשמורה אחר יצר אותם.
-- בטוח להרצה חוזרת.
-- =====================================================================
drop policy if exists calendar_admin_school on public.calendar_events;
create policy calendar_admin_school on public.calendar_events for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
notify pgrst, 'reload schema';
