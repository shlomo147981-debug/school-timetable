-- בדיקות פרטיות למערכת פרטנית (אחרי 0005). להרצה על DB מקומי בלבד.
begin;
-- מזהי משתמשים מראש (כחשבון-על) — כדי שהחלפת משתמש לא תיחסם ע"י RLS של המשתמש הקודם
create temp table ids (username text, id uuid);
grant select on ids to authenticated;
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  if not exists (select 1 from ids where username = u) then raise exception 'unknown test user %', u; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where username = u))::text, true);
end $$;
create function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$ begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;
-- תלמידים, הורים, כיתה נוספת
do $$ declare c uuid := (select id from classes where name='ח1'); c2 uuid; begin
  insert into classes(name) values ('ז-בדיקה') returning id into c2;
  perform private.ensure_user('stu1','תלמיד אחד','student', c);
  perform private.ensure_user('stu2','תלמיד שתיים','student', c);
  perform private.ensure_user('stu9','תלמיד כיתה אחרת','student', c2);
  perform private.ensure_user('par1','הורה אחד','parent');
  perform private.ensure_user('par2','הורה שתיים','parent');
  insert into parent_children select (select id from profiles where username='par1'), (select id from profiles where username='stu1');
  insert into parent_children select (select id from profiles where username='par2'), (select id from profiles where username='stu2');
  -- נעמה מלמדת גם עברית בכיתה (שיעור כיתתי נוסף)
  insert into lessons(class_id, teacher_id, subject, day_of_week, start_time, end_time) values (c, (select id from profiles where username='naama'), 'עברית', 5, '15:30', '16:15');
  -- שיעור אישי ל-s1 עם עליסה
  insert into lessons(class_id, teacher_id, student_id, subject, day_of_week, start_time, end_time)
    values (c, (select id from profiles where username='alisa'), (select id from profiles where username='stu1'), 'תגבור אישי', 2, '14:00', '14:45');
end $$;
insert into ids select username, id from profiles;
-- דריסות פרטניות ל-s1 (נכתבות ע"י המחנך שלמה)
set local role authenticated;
select pg_temp.as_user('shlomo');
insert into lesson_student_changes (lesson_id, student_id, change_date, kind, note)
  select l.id, (select id from profiles where username='stu1'), '2026-11-10', 'cancelled', 'הכלה' from lessons l where l.subject='מדעים' and l.day_of_week=3 and l.start_time='10:25';
insert into lesson_student_changes (lesson_id, student_id, change_date, until_date, kind, new_subject)
  select l.id, (select id from profiles where username='stu1'), '2026-11-09', '2027-06-30', 'modified', 'תגבור קריאה' from lessons l where l.subject='עברית' and l.day_of_week=2;
select pg_temp.check('homeroom wrote 2 overrides for s1', (select count(*) from lesson_student_changes)=2);
do $$ begin
  begin insert into lesson_student_changes (lesson_id, student_id, change_date, kind)
    select l.id, (select id from profiles where username='stu9'), '2026-11-10', 'cancelled' from lessons l where l.subject='מדעים' limit 1;
    raise notice 'FAIL override for student of another class'; exception when insufficient_privilege then raise notice 'PASS cannot override student of another class'; end;
end $$;

select pg_temp.as_user('stu1');
select pg_temp.check('s1 sees own 2 overrides', (select count(*) from lesson_student_changes)=2);
select pg_temp.check('s1 sees own personal lesson', exists(select 1 from lessons where subject='תגבור אישי'));
select pg_temp.as_user('stu2');
select pg_temp.check('switched to stu2', auth.uid() = (select id from ids where username='stu2'));
select pg_temp.check('s2 sees NO overrides of s1', (select count(*) from lesson_student_changes)=0);
select pg_temp.check('s2 does NOT see s1 personal lesson', not exists(select 1 from lessons where subject='תגבור אישי'));
select pg_temp.check('s2 still sees class lessons', (select count(*) from lessons where student_id is null) >= 39);
select pg_temp.as_user('par1');
select pg_temp.check('p1 (parent of s1) sees overrides + personal', (select count(*) from lesson_student_changes)=2 and exists(select 1 from lessons where subject='תגבור אישי'));
select pg_temp.as_user('par2');
select pg_temp.check('switched to par2', auth.uid() = (select id from ids where username='par2'));
select pg_temp.check('p2 (other parent) sees nothing personal of s1', (select count(*) from lesson_student_changes)=0 and not exists(select 1 from lessons where subject='תגבור אישי'));
select pg_temp.as_user('ravit');
select pg_temp.check('ravit (teacher of the science lesson) sees only the science override', (select count(*) from lesson_student_changes)=1 and (select note from lesson_student_changes)='הכלה');
select pg_temp.check('ravit does NOT see s1 personal lesson (not her subject)', not exists(select 1 from lessons where subject='תגבור אישי'));
select pg_temp.as_user('odelia');
select pg_temp.check('odelia (Hebrew lesson teacher) sees Hebrew override only', (select count(*) from lesson_student_changes)=1 and (select new_subject from lesson_student_changes)='תגבור קריאה');
select pg_temp.as_user('naama');
select pg_temp.check('naama (teaches Hebrew in class, other lesson) sees Hebrew override', (select count(*) from lesson_student_changes)=1);
select pg_temp.as_user('tzofia');
select pg_temp.check('tzofia (math only) sees no overrides', (select count(*) from lesson_student_changes)=0);
select pg_temp.as_user('alisa');
select pg_temp.check('alisa (teacher of the personal lesson) sees it', exists(select 1 from lessons where subject='תגבור אישי'));
do $$ begin
  begin insert into lesson_student_changes (lesson_id, student_id, change_date, kind)
    select l.id, (select id from profiles where username='stu1'), '2026-11-17', 'cancelled' from lessons l where l.subject='מתמטיקה' limit 1;
    raise notice 'FAIL subject teacher cannot write overrides'; exception when insufficient_privilege then raise notice 'PASS subject teacher cannot write overrides'; end;
end $$;
select pg_temp.as_user('shlomo');
select pg_temp.check('homeroom/admin sees everything', (select count(*) from lesson_student_changes)=2 and exists(select 1 from lessons where subject='תגבור אישי'));
delete from lesson_student_changes where note='הכלה';
select pg_temp.check('homeroom can delete override', (select count(*) from lesson_student_changes)=1);
reset role;
set local role anon;
do $$ begin perform count(*) from lesson_student_changes; raise notice 'FAIL anon'; exception when insufficient_privilege then raise notice 'PASS anon blocked'; end $$;
rollback;
