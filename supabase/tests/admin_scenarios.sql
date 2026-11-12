-- בדיקות ניהול משתמשים ומנהל-על (אחרי 0003). להרצה על DB מקומי בלבד — יוצר ומוחק משתמשי בדיקה.
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where username=u))::text, false) $$;
create function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$ begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;
set role authenticated;
select pg_temp.as_user('shlomo');
select pg_temp.check('admin sees all teachers', (select count(*) from profiles where role='teacher')=7);
-- create student, parent with child
select public.admin_create_user('stud1','Secret123','תלמיד בדיקה','student',(select id from classes where name='ח1'));
select public.admin_create_user('par1','Secret123','הורה בדיקה','parent',null, array[(select id from profiles where username='stud1')]);
select pg_temp.check('student created w/ class', (select class_id is not null from profiles where username='stud1'));
select pg_temp.check('parent linked', (select count(*) from parent_children pc join profiles p on p.id=pc.parent_id where p.username='par1')=1);
reset role;
select pg_temp.check('auth user + identity + bcrypt', (select encrypted_password like '$2%' and email='stud1@school.local' from auth.users u join profiles p on p.id=u.id where p.username='stud1') and (select count(*) from auth.identities i join profiles p on p.id=i.user_id where p.username='stud1')=1);
set role authenticated; select pg_temp.as_user('shlomo');
do $$ begin
  begin perform public.admin_create_user('stud1','Secret123','x','student',(select id from classes where name='ח1')); raise notice 'FAIL duplicate username'; exception when unique_violation then raise notice 'PASS duplicate username rejected'; end;
  begin perform public.admin_create_user('Bad Name!','Secret123','x','teacher'); raise notice 'FAIL bad username'; exception when invalid_parameter_value then raise notice 'PASS bad username rejected'; end;
  begin perform public.admin_create_user('shortpw','123','x','teacher'); raise notice 'FAIL short password'; exception when invalid_parameter_value then raise notice 'PASS short password rejected'; end;
  begin perform public.admin_delete_user(auth.uid()); raise notice 'FAIL self delete'; exception when invalid_parameter_value then raise notice 'PASS cannot delete self'; end;
  begin perform public.admin_update_user(auth.uid(),'שלמה יצחקי','homeroom',(select id from classes where name='ח1'),null,null,false); raise notice 'FAIL self demote'; exception when invalid_parameter_value then raise notice 'PASS cannot remove own admin'; end;
end $$;
-- update: rename + password
select public.admin_update_user((select id from profiles where username='stud1'),'תלמיד מעודכן','student',(select id from classes where name='ח1'),'NewPass99');
reset role;
select pg_temp.check('update name + password', (select full_name from profiles where username='stud1')='תלמיד מעודכן' and (select encrypted_password = crypt('NewPass99', encrypted_password) from auth.users where email='stud1@school.local'));
set role authenticated; select pg_temp.as_user('shlomo');
-- admin can edit timetable (homeroom of ח1) and add lesson
insert into lessons (class_id, day_of_week, start_time, end_time, subject) values ((select id from classes where name='ח1'), 2, '14:40','15:20','חוג');
select pg_temp.check('homeroom adds lesson', exists(select 1 from lessons where subject='חוג'));
-- non admin teacher
select pg_temp.as_user('ravit');
do $$ begin
  begin perform public.admin_create_user('hack','Secret123','x','teacher'); raise notice 'FAIL teacher cannot create users'; exception when insufficient_privilege then raise notice 'PASS teacher cannot create users'; end;
  begin perform public.admin_delete_user((select id from profiles where username='stud1')); raise notice 'FAIL teacher cannot delete'; exception when insufficient_privilege then raise notice 'PASS teacher cannot delete users'; end;
  begin perform private.create_auth_user('x1','Secret123'); raise notice 'FAIL direct private call'; exception when insufficient_privilege then raise notice 'PASS internal create_auth_user not callable'; end;
end $$;
update profiles set is_admin = true where id = auth.uid();
select pg_temp.check('teacher cannot self-promote', not (select is_admin from profiles where username='ravit'));
select pg_temp.check('ravit (teaches ח1) sees student', exists(select 1 from profiles where username='stud1'));
select pg_temp.check('ravit does not see parent? (staff sees parents of own students)', exists(select 1 from profiles where username='par1'));
-- co-teacher hadasa can report on math lesson
select pg_temp.as_user('hadasa');
insert into student_events (lesson_id, lesson_date, student_id, reporter_id, type)
 select l.id, date '2026-11-15', (select id from profiles where username='stud1'), auth.uid(), 'praise' from lessons l where l.subject='מתמטיקה עמ"ט' and l.day_of_week=1 limit 1;
select pg_temp.check('co-teacher can report', (select count(*) from student_events where reporter_id = auth.uid())=1);
-- parent sees only own child
select pg_temp.as_user('par1');
select pg_temp.check('parent sees only own child', (select count(*) from profiles where role='student')=1);
select pg_temp.check('parent sees ח1 lessons', (select count(*) from lessons) >= 39);
-- delete user by admin (with event history -> reporter set null etc.)
select pg_temp.as_user('shlomo');
select public.admin_delete_user((select id from profiles where username='hadasa'));
select pg_temp.check('delete teacher with history', not exists(select 1 from profiles where username='hadasa'));
select pg_temp.check('co_teacher nulled, lessons kept', (select count(*) from lessons where subject='מתמטיקה עמ"ט') = 5 and (select count(co_teacher_id) from lessons where subject='מתמטיקה עמ"ט') = 0);
select public.admin_delete_user((select id from profiles where username='stud1'));
reset role;
select pg_temp.check('auth user removed', not exists(select 1 from auth.users where email='stud1@school.local'));
set role anon;
do $$ begin perform public.admin_create_user('a','b','c','teacher'); raise notice 'FAIL anon rpc'; exception when insufficient_privilege then raise notice 'PASS anon cannot call admin rpc'; end $$;
