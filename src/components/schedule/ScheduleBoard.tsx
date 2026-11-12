'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Assignment, CalendarEvent, Occurrence, Person, Role, StudentEvent, View } from '@/lib/types';
import { isStaff } from '@/lib/types';
import { hhmm } from '@/lib/dates';
import DayView from './DayView';
import WeekView from './WeekView';
import MonthView from './MonthView';
import BulkBar from './BulkBar';
import TeacherQuickModal from '../modals/TeacherQuickModal';
import RequestModal from '../modals/RequestModal';
import AddLessonModal from '../modals/AddLessonModal';

export interface BoardProps {
  view: View;
  date: string;
  today: string;
  viewerRole: Role;
  classId: string;
  studentId: string | null;
  homeroomId: string | null;
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

/** אפשרויות עריכה שמועברות לתצוגות יום/שבוע */
export interface EditProps {
  canEdit: boolean;
  editMode: boolean;
  selected: Set<string>;
  onToggle: (o: Occurrence) => void;
  onSelectDay: (date: string) => void;
  onAdd: (date: string) => void;
}

export default function ScheduleBoard(props: BoardProps) {
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addFor, setAddFor] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const router = useRouter();
  const params = useSearchParams();
  const staff = isStaff(props.viewerRole) || props.canEditSchedule;

  const openDay = (date: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('view', 'day');
    next.set('date', date);
    router.push(`?${next.toString()}`);
  };

  const byKey = useMemo(() => new Map(props.occurrences.map((o) => [o.key, o])), [props.occurrences]);
  const pickedOccs = [...picked].map((k) => byKey.get(k)).filter((o): o is Occurrence => !!o);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const edit: EditProps = {
    canEdit: props.canEditSchedule,
    editMode,
    selected: picked,
    onToggle: (o) => setPicked((s) => { const n = new Set(s); n.has(o.key) ? n.delete(o.key) : n.add(o.key); return n; }),
    onSelectDay: (date) => setPicked((s) => {
      const keys = props.occurrences.filter((o) => o.date === date).map((o) => o.key);
      const all = keys.every((k) => s.has(k));
      const n = new Set(s);
      keys.forEach((k) => (all ? n.delete(k) : n.add(k)));
      return n;
    }),
    onAdd: setAddFor,
  };

  const lastEnd = (date: string) => {
    const list = props.occurrences.filter((o) => o.date === date && o.status !== 'cancelled');
    return list.length ? hhmm(list[list.length - 1].end) : '08:15';
  };

  return (
    <>
      {props.canEditSchedule && props.view !== 'month' && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditMode(!editMode); setPicked(new Set()); }}
            className={`btn ${editMode ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50'}`}
          >
            ✏️ {editMode ? 'יציאה ממצב עריכה' : 'מצב עריכה'}
          </button>
          <span className="text-xs text-slate-500">
            {editMode ? 'סמנו שיעורים או "בחר יום שלם", ובחרו פעולה בסרגל התחתון' : 'לחיצה על שיעור פותחת עריכה • ➕ להוספת שיעור'}
          </span>
        </div>
      )}

      <div className={editMode ? 'pb-32' : ''}>
        {props.view === 'day' && (
          <DayView date={props.date} occurrences={props.occurrences} calendar={props.calendar}
            onSelect={setSelected} edit={edit} />
        )}
        {props.view === 'week' && (
          <WeekView date={props.date} today={props.today} occurrences={props.occurrences} calendar={props.calendar}
            onSelect={setSelected} edit={edit} />
        )}
        {props.view === 'month' && (
          <MonthView date={props.date} today={props.today} calendar={props.calendar}
            assignments={props.assignments} events={props.events} onOpenDay={openDay} />
        )}
      </div>

      {editMode && (
        <BulkBar selected={pickedOccs} classId={props.classId}
          onDone={(m) => { setPicked(new Set()); props.onChanged(); notify(m); }}
          onClear={() => setPicked(new Set())}
          onExit={() => { setEditMode(false); setPicked(new Set()); }} />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
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
        <RequestModal occurrence={selected} studentId={props.studentId} homeroomId={props.homeroomId}
          onChanged={props.onChanged} onClose={() => setSelected(null)} />
      )}
      {addFor && (
        <AddLessonModal
          date={addFor}
          classId={props.classId}
          defaultStart={lastEnd(addFor)}
          teachers={props.teachers}
          student={props.students.find((s) => s.id === props.studentId) ?? null}
          onClose={() => setAddFor(null)}
          onSaved={() => { props.onChanged(); notify('השיעור נוסף'); }}
        />
      )}
    </>
  );
}
