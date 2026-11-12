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
