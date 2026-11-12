-- =====================================================================
-- SETUP_UPGRADE_0003.sql — שדרוג: מנהל-על, כיתה ח1 + מערכת שעות, עריכת מערכת
-- הדביקו את כל הקובץ ב-Supabase → SQL Editor → Run (פעם אחת; בטוח גם להרצה חוזרת).
-- דורש שכבר הורץ SETUP_ALL.sql המקורי (0001+0002).
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';
