import { requireProfile } from '@/lib/auth';
import { resolveContext } from '@/lib/context';
import { isValidISO, rangeFor, rangeTitle, toSchoolDay, todayISO } from '@/lib/dates';
import { loadSchedule } from '@/lib/loadSchedule';
import { buildOccurrences } from '@/lib/schedule';
import type { View } from '@/lib/types';
import ScheduleToolbar from '@/components/schedule/ScheduleToolbar';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile();

  const view: View = sp.view === 'day' || sp.view === 'month' ? sp.view : 'week';
  const date = toSchoolDay(isValidISO(sp.date) ? sp.date : todayISO());
  const ctx = await resolveContext(supabase, profile, sp);

  const toolbar = (
    <ScheduleToolbar
      role={profile.role}
      view={view}
      date={date}
      title={rangeTitle(view, date)}
      classId={ctx.classId}
      className={ctx.className}
      studentId={ctx.studentId}
      scope={ctx.scope}
      classes={ctx.classes}
      students={ctx.students}
      kids={ctx.children}
    />
  );

  if (!ctx.classId) {
    return (
      <>
        {toolbar}
        <div className="card p-10 text-center text-slate-500">לא נמצאה כיתה משויכת למשתמש זה.</div>
      </>
    );
  }

  const { from, to } = rangeFor(view, date);
  const data = await loadSchedule(supabase, {
    classId: ctx.classId, studentId: ctx.studentId, scope: ctx.scope, from, to,
  });
  const occurrences = buildOccurrences({ from, to, ...data });

  return (
    <>
      {toolbar}
      <ScheduleBoard
        view={view}
        date={date}
        today={todayISO()}
        viewerRole={profile.role}
        classId={ctx.classId}
        studentId={ctx.studentId}
        occurrences={occurrences}
        calendar={data.calendar}
        assignments={data.assignments}
        events={data.events}
        students={ctx.students}
        teachers={ctx.teachers}
        canEditSchedule={ctx.canEditSchedule}
      />
    </>
  );
}
