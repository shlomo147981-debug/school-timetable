-- בדיקות תרחישי RLS (26 בדיקות). להרצה על DB מקומי עם המיגרציות (supabase start).
-- כל שורה מדפיסה PASS/FAIL. הרצה: psql "$DB_URL" -f supabase/tests/rls_scenarios.sql
begin;
\set ON_ERROR_STOP 1
-- ids
insert into auth.users (id) select ('00000000-0000-0000-0000-00000000000'||x)::uuid from unnest(array['1','2','3','4','5','6','7','8']) x;
insert into classes (id,name) values ('c0000000-0000-0000-0000-000000000001','C1'),('c0000000-0000-0000-0000-000000000002','C2');
insert into profiles (id,username,full_name,role,class_id) values
 ('00000000-0000-0000-0000-000000000001','h','Homeroom','homeroom','c0000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002','t','Teacher','teacher',null),
 ('00000000-0000-0000-0000-000000000003','t2','Teacher2','teacher',null),
 ('00000000-0000-0000-0000-000000000004','s1','S1','student','c0000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000005','s2','S2','student','c0000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000006','s3','S3','student','c0000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000007','p','P','parent',null),
 ('00000000-0000-0000-0000-000000000008','p2','P2','parent',null);
update classes set homeroom_teacher_id='00000000-0000-0000-0000-000000000001' where name='C1';
insert into parent_children values ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000006'),('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000005');
insert into lessons (id,class_id,teacher_id,subject,day_of_week,start_time,end_time,student_id) values
 ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Math',1,'08:00','08:45',null),
 ('a0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Tutor S2',2,'13:00','13:45','00000000-0000-0000-0000-000000000005'),
 ('a0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','Eng',1,'08:00','08:45',null);

create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000'||u)::text, false) $$;
create function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$ begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;

set role authenticated;
-- teacher reports on S1 and S2 (lesson date 2026-11-08 is Sunday)
select pg_temp.as_user('2');
insert into student_events (lesson_id,lesson_date,student_id,reporter_id,type) values
 ('a0000000-0000-0000-0000-000000000001','2026-11-08','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','absence'),
 ('a0000000-0000-0000-0000-000000000001','2026-11-08','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002','misbehavior');
select pg_temp.check('teacher: default status pending', (select status from student_events where type='absence')='pending_justification');
do $$ begin
  begin insert into student_events (lesson_id,lesson_date,student_id,reporter_id,type) values ('a0000000-0000-0000-0000-000000000001','2026-11-08','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','late');
    raise notice 'FAIL teacher cannot report student of other class'; exception when insufficient_privilege then raise notice 'PASS teacher cannot report student of other class'; end;
  begin insert into student_events (lesson_id,lesson_date,student_id,reporter_id,type) values ('a0000000-0000-0000-0000-000000000003','2026-11-08','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','late');
    raise notice 'FAIL teacher cannot report on others lesson'; exception when insufficient_privilege then raise notice 'PASS teacher cannot report on others lesson'; end;
  begin insert into lessons (class_id,teacher_id,subject,day_of_week,start_time,end_time) values ('c0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','X',1,'09:00','10:00');
    raise notice 'FAIL subject teacher cannot edit schedule'; exception when insufficient_privilege then raise notice 'PASS subject teacher cannot edit schedule'; end;
end $$;

-- parent P (children S1 in C1, S3 in C2)
select pg_temp.as_user('7');
select pg_temp.check('parent sees only own kids profiles', (select array_agg(username order by username) from profiles where role='student') = array['s1','s3']);
select pg_temp.check('parent sees only own kid events', (select count(*) from student_events) = 1 and (select student_id from student_events)='00000000-0000-0000-0000-000000000004');
select pg_temp.check('parent sees class lessons of both kids but not S2 personal lesson', (select array_agg(subject order by subject) from lessons) = array['Eng','Math']);
select pg_temp.check('parent sees both classes', (select count(*) from classes)=2);
select pg_temp.check('parent cannot see other parents link', (select count(*) from parent_children)=2);
insert into student_requests (student_id,created_by,teacher_id,event_id,kind,message) select '00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002',id,'justify_absence','sick' from student_events;
select pg_temp.check('parent submitted request', (select count(*) from student_requests)=1);
do $$ begin
  begin insert into student_requests (student_id,created_by,teacher_id,kind,message) values ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000002','other','x');
    raise notice 'FAIL parent cannot request for other child'; exception when insufficient_privilege then raise notice 'PASS parent cannot request for other child'; end;
  begin update student_events set status='justified';
    if (select status from student_events limit 1)='justified' then raise notice 'FAIL parent cannot self-justify'; else raise notice 'PASS parent cannot self-justify'; end if; end;
  begin update profiles set role='homeroom' where id=auth.uid(); 
    if (select role from profiles where id=auth.uid())='parent' then raise notice 'PASS cannot escalate role'; else raise notice 'FAIL cannot escalate role'; end if; end;
end $$;

-- parent P2 (only S2)
select pg_temp.as_user('8');
select pg_temp.check('P2 sees S2 events only (misbehavior)', (select array_agg(type::text) from student_events) = array['misbehavior']);
select pg_temp.check('P2 sees S2 personal lesson', exists(select 1 from lessons where subject='Tutor S2'));
select pg_temp.check('P2 sees no requests of others', (select count(*) from student_requests)=0);
select pg_temp.check('P2 sees no C2', (select count(*) from classes)=1);

-- student S1
select pg_temp.as_user('4');
select pg_temp.check('student sees only self events', (select count(*) from student_events)=1);
select pg_temp.check('student does not see classmates profiles', (select count(*) from profiles where role='student')=1);
select pg_temp.check('student does not see S2 personal lesson', not exists(select 1 from lessons where subject='Tutor S2'));

-- teacher resolves request
select pg_temp.as_user('2');
update student_requests set status='approved', response='ok';
reset role;
select pg_temp.check('approval justified the event (trigger)', (select status from student_events where type='absence')='justified');
set role authenticated;
select pg_temp.as_user('2');
do $$ begin
  begin update student_requests set message='hacked';
    raise notice 'FAIL teacher cannot edit request message'; exception when insufficient_privilege then raise notice 'PASS teacher cannot edit request message'; end;
end $$;

-- unrelated teacher T2 cannot see C1 events
select pg_temp.as_user('3');
select pg_temp.check('unrelated teacher sees no C1 events', (select count(*) from student_events)=0);
-- homeroom adds substitute T2 -> T2 can now report on that date
select pg_temp.as_user('1');
insert into lesson_changes (lesson_id,change_date,kind,substitute_teacher_id) values ('a0000000-0000-0000-0000-000000000001','2026-11-15','substitute','00000000-0000-0000-0000-000000000003');
select pg_temp.check('homeroom sees all class events', (select count(*) from student_events)=2);
select pg_temp.as_user('3');
insert into student_events (lesson_id,lesson_date,student_id,reporter_id,type) values ('a0000000-0000-0000-0000-000000000001','2026-11-15','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','praise');
select pg_temp.check('substitute can report on that date', (select count(*) from student_events where type='praise')=1);
-- anon
reset role; set role anon;
do $$ begin perform count(*) from lessons; raise notice 'FAIL anon blocked'; exception when insufficient_privilege then raise notice 'PASS anon blocked'; end $$;
rollback;
