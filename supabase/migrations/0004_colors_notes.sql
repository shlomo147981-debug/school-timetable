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
