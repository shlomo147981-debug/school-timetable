'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNav } from '@/lib/nav';
import { getSupabase } from '@/lib/supabase/client';
import { resolveContext, type ViewContext } from '@/lib/context';
import { isValidISO, rangeFor, rangeTitle, toSchoolDay, todayISO } from '@/lib/dates';
import { loadSchedule } from '@/lib/loadSchedule';
import { buildOccurrences, groupPersonal } from '@/lib/schedule';
import type { Assignment, CalendarEvent, Occurrence, Profile, StudentEvent, View } from '@/lib/types';
import ScheduleToolbar from '../schedule/ScheduleToolbar';
import ScheduleBoard from '../schedule/ScheduleBoard';

interface Loaded {
  ctx: ViewContext;
  occurrences: Occurrence[];
  calendar: CalendarEvent[];
  assignments: Assignment[];
  events: StudentEvent[];
}

export default function ScheduleScreen({ profile }: { profile: Profile }) {
  const { params } = useNav();
  const key = params.toString();
  const view: View = params.get('view') === 'day' || params.get('view') === 'month' ? (params.get('view') as View) : 'week';
  const rawDate = params.get('date') ?? undefined;
  const date = toSchoolDay(isValidISO(rawDate) ? rawDate : todayISO());

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const supabase = getSupabase();
        const sp = Object.fromEntries(new URLSearchParams(key).entries());
        const ctx = await resolveContext(supabase, profile, sp);
        let loaded: Loaded = { ctx, occurrences: [], calendar: [], assignments: [], events: [] };
        if (ctx.classId) {
          const { from, to } = rangeFor(view, date);
          const d = await loadSchedule(supabase, { classId: ctx.classId, studentId: ctx.studentId, scope: ctx.scope, from, to });
          const built = buildOccurrences({ from, to, ...d, studentId: ctx.scope === 'personal' ? ctx.studentId : null });
          const nameOf = (id: string) => ctx.students.find((s) => s.id === id)?.full_name ?? 'תלמיד/ה';
          loaded = { ctx, occurrences: ctx.studentId ? built : groupPersonal(built, nameOf), calendar: d.calendar, assignments: d.assignments, events: d.events };
        }
        if (!cancelled) setData(loaded);
      } catch {
        if (!cancelled) setError('טעינת המערכת נכשלה. בדקו את החיבור לאינטרנט.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key, profile, view, date, tick]);

  const ctx = data?.ctx;
  return (
    <>
      <ScheduleToolbar
        role={profile.role}
        view={view}
        date={date}
        title={rangeTitle(view, date)}
        classId={ctx?.classId ?? null}
        className={ctx?.className ?? ''}
        studentId={ctx?.studentId ?? null}
        scope={ctx?.scope ?? 'personal'}
        classes={ctx?.classes ?? []}
        students={ctx?.students ?? []}
        kids={ctx?.children ?? []}
      />

      {error && (
        <div className="card mb-4 flex items-center justify-between gap-3 border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
          <button className="btn-ghost" onClick={refresh}>נסו שוב</button>
        </div>
      )}

      {!data ? (
        <div className="card p-10 text-center text-slate-400">טוען…</div>
      ) : !data.ctx.classId ? (
        <div className="card p-10 text-center text-slate-500">לא נמצאה כיתה משויכת למשתמש זה.</div>
      ) : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <ScheduleBoard
            view={view}
            date={date}
            today={todayISO()}
            viewerRole={profile.role}
            classId={data.ctx.classId}
            studentId={data.ctx.studentId}
            homeroomId={data.ctx.homeroomId}
            occurrences={data.occurrences}
            calendar={data.calendar}
            assignments={data.assignments}
            events={data.events}
            students={data.ctx.students}
            teachers={data.ctx.teachers}
            canEditSchedule={data.ctx.canEditSchedule}
            editableClasses={(profile.is_admin ? data.ctx.classes : data.ctx.classes.filter((c) => c.homeroom_teacher_id === profile.id)).map((c) => ({ id: c.id, name: c.name }))}
            onChanged={refresh}
          />
        </div>
      )}
    </>
  );
}
