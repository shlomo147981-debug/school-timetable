'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Assignment, CalendarEvent, Occurrence, Person, Role, StudentEvent, View } from '@/lib/types';
import { isStaff } from '@/lib/types';
import DayView from './DayView';
import WeekView from './WeekView';
import MonthView from './MonthView';
import TeacherQuickModal from '../modals/TeacherQuickModal';
import RequestModal from '../modals/RequestModal';

export interface BoardProps {
  view: View;
  date: string;
  today: string;
  viewerRole: Role;
  classId: string;
  studentId: string | null;
  occurrences: Occurrence[];
  calendar: CalendarEvent[];
  assignments: Assignment[];
  events: StudentEvent[];
  students: Person[];
  teachers: Person[];
  canEditSchedule: boolean;
  /** נקרא אחרי שמירה — טוען מחדש את הנתונים */
  onChanged: () => void;
}

export default function ScheduleBoard(props: BoardProps) {
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const staff = isStaff(props.viewerRole);

  const openDay = (date: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('view', 'day');
    next.set('date', date);
    router.push(`?${next.toString()}`);
  };

  return (
    <>
      {props.view === 'day' && (
        <DayView date={props.date} occurrences={props.occurrences} calendar={props.calendar} onSelect={setSelected} />
      )}
      {props.view === 'week' && (
        <WeekView date={props.date} today={props.today} occurrences={props.occurrences} calendar={props.calendar} onSelect={setSelected} />
      )}
      {props.view === 'month' && (
        <MonthView date={props.date} today={props.today} calendar={props.calendar}
          assignments={props.assignments} events={props.events} onOpenDay={openDay} />
      )}

      {selected && staff && (
        <TeacherQuickModal
          occurrence={selected}
          classId={props.classId}
          students={props.students}
          preselectedStudentId={props.studentId}
          teachers={props.teachers}
          canEditSchedule={props.canEditSchedule}
          onChanged={props.onChanged}
          onClose={() => setSelected(null)}
        />
      )}
      {selected && !staff && props.studentId && (
        <RequestModal occurrence={selected} studentId={props.studentId} onChanged={props.onChanged} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
