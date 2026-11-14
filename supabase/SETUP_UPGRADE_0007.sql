-- SETUP_UPGRADE_0007.sql — גרסה 1.8.0 (אופציונלי): מנהל-על מוחק גם אירועים בית-ספריים.
begin;
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
commit;
notify pgrst, 'reload schema';
