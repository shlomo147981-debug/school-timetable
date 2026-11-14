-- בדיקות מחיקת הערות ואירועים (1.8.0). להרצה על DB מקומי בלבד.
begin;
create temp table ids (username text, id uuid); grant select on ids to authenticated;
create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from ids where username = u))::text, true); end $$;
create function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$ begin raise notice '% %', case when ok then 'PASS' else 'FAIL' end, name; end $$;
do $$ declare c uuid := (select id from classes where name='ח1'); s uuid; begin
  s := private.ensure_user('stu_d','תלמיד מחיקה','student', c);
  perform private.ensure_user('par_d','הורה מחיקה','parent');
  insert into parent_children select (select id from profiles where username='par_d'), s;
  -- הערות של רווית (מדעים) ושל אודליה (עברית)
  insert into student_events(lesson_id, lesson_date, student_id, reporter_id, type, note)
    select l.id, '2026-11-10', s, l.teacher_id, 'late', 'הערת רווית' from lessons l where l.subject='מדעים' and l.day_of_week=3 limit 1;
  insert into student_events(lesson_id, lesson_date, student_id, reporter_id, type, note)
    select l.id, '2026-11-09', s, l.teacher_id, 'praise', 'הערת אודליה' from lessons l where l.subject='עברית' and l.day_of_week=2 limit 1;
  insert into assignments(lesson_id, class_id, type, title, due_date, created_by)
    select l.id, c, 'exam', 'מבחן של רווית', '2026-11-20', l.teacher_id from lessons l where l.subject='מדעים' limit 1;
  insert into calendar_events(class_id, kind, title, start_date, end_date) values (c, 'trip', 'טיול לבדיקה', '2026-11-25', '2026-11-25');
  insert into calendar_events(class_id, kind, title, start_date, end_date) values (null, 'holiday', 'חופשה בית-ספרית', '2026-12-20', '2026-12-20');
end $$;
insert into ids select username, id from profiles;
set local role authenticated;
-- מי לא רשאי
select pg_temp.as_user('stu_d');  delete from student_events; select pg_temp.check('student cannot delete notes', (select count(*) from student_events) = 2);
select pg_temp.as_user('par_d');  delete from student_events; delete from calendar_events; select pg_temp.check('parent cannot delete notes/events', (select count(*) from student_events) = 2 and (select count(*) from calendar_events) >= 1);
select pg_temp.as_user('odelia'); delete from student_events where note = 'הערת רווית';
reset role; select pg_temp.check('other subject teacher cannot delete ravit''s note', (select count(*) from student_events where note='הערת רווית') = 1); set local role authenticated;
select pg_temp.as_user('odelia'); delete from assignments where title = 'מבחן של רווית'; delete from calendar_events where title = 'טיול לבדיקה';
reset role; select pg_temp.check('subject teacher cannot delete others'' exam / class trip', (select count(*) from assignments)=1 and (select count(*) from calendar_events where title='טיול לבדיקה')=1); set local role authenticated;
-- יוצר ההערה רשאי
select pg_temp.as_user('odelia'); delete from student_events where note = 'הערת אודליה';
reset role; select pg_temp.check('author can delete own note', (select count(*) from student_events where note='הערת אודליה') = 0); set local role authenticated;
-- מחנך/מנהל (shlomo) רשאי הכל
select pg_temp.as_user('shlomo');
delete from student_events where note = 'הערת רווית';
delete from assignments where title = 'מבחן של רווית';
delete from calendar_events where title = 'טיול לבדיקה';
delete from calendar_events where title = 'חופשה בית-ספרית';
reset role;
select pg_temp.check('homeroom deletes subject teacher''s note', (select count(*) from student_events) = 0);
select pg_temp.check('homeroom deletes teacher''s exam', (select count(*) from assignments) = 0);
select pg_temp.check('homeroom deletes class trip', (select count(*) from calendar_events where title='טיול לבדיקה') = 0);
select pg_temp.check('admin deletes school-wide event (0007)', (select count(*) from calendar_events where title='חופשה בית-ספרית') = 0);
rollback;
