-- =====================================================================
-- SETUP_ALL.sql — הדביקו את כל הקובץ ב-Supabase → SQL Editor → Run
-- מאחד את 0001_schema.sql + 0002_rls.sql בטרנזקציה אחת (הכל או כלום).
-- =====================================================================
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

commit;

-- רענון ה-API כדי שהטבלאות החדשות יזוהו מיד
notify pgrst, 'reload schema';
