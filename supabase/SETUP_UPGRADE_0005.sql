-- SETUP_UPGRADE_0005.sql — גרסה 1.4.0: מערכת פרטנית לתלמיד + פרטיות. להדבקה ב-Supabase → SQL Editor → Run.
-- בטוח להרצה חוזרת. אינו שובר גרסאות קודמות של האפליקציה.
begin;
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
notify pgrst, 'reload schema';
