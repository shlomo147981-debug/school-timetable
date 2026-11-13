'use client';

import { useMemo, useState } from 'react';
import { useNav } from '@/lib/nav';
import type { Assignment, CalendarEvent, Occurrence, Person, Role, StudentEvent, View } from '@/lib/types';
import { isStaff } from '@/lib/types';
import DayView from './DayView';
import WeekView from './WeekView';
import MonthView from './MonthView';
import BulkBar from './BulkBar';
import TeacherQuickModal from '../modals/TeacherQuickModal';
import RequestModal from '../modals/RequestModal';
import EventEditor, { type EditorSaved } from '../modals/EventEditor';

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
  /** כיתות שהמשתמש רשאי לערוך (לבורר הכיתה בעורך) */
  editableClasses: { id: string; name: string }[];
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
  /** none · edit (✏️ מצב עריכה) · delete (− מצב מחיקה) */
  const [barMode, setBarMode] = useState<'none' | 'edit' | 'delete'>('none');
  const editMode = barMode !== 'none';
  const student = props.students.find((s) => s.id === props.studentId) ?? null;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ date: string; occurrence: Occurrence | null } | null>(null);
  const [toast, setToast] = useState('');
  const { navigate } = useNav();
  const openEditor = (date: string, occurrence: Occurrence | null = null) => { setSelected(null); setEditor({ date, occurrence }); };
  const afterSave = (msg: string, where: EditorSaved) => {
    props.onChanged(); notify(msg);
    if (where.classId !== props.classId) navigate({ class: where.classId, date: where.date, student: null });
    else if (where.date !== props.date) navigate({ date: where.date });
  };
  const staff = isStaff(props.viewerRole) || props.canEditSchedule;

  const openDay = (date: string) => navigate({ view: 'day', date });

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
    onAdd: (date) => openEditor(date),
  };


  return (
    <>
      {props.canEditSchedule && props.view !== 'month' && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setBarMode(barMode === 'edit' ? 'none' : 'edit'); setPicked(new Set()); }}
            className={`btn ${barMode === 'edit' ? 'bg-brand-600 text-white' : 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50'}`}
          >
            ✏️ {barMode === 'edit' ? 'יציאה ממצב עריכה' : 'מצב עריכה'}
          </button>
          <span className="text-xs text-slate-500">
            {editMode ? 'סמנו שיעורים או "בחר יום שלם", ובחרו פעולה בסרגל התחתון' : 'לחיצה על שיעור פותחת עריכה • ➕ הוספה • − מחיקה'}
          </span>
        </div>
      )}

      {/* חיווי: עריכה פרטנית לתלמיד */}
      {props.canEditSchedule && student && (
        <div role="note" className="mb-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <span aria-hidden>👤</span>
          <span><b>שינוי פרטני עבור: {student.full_name}</b> — גלוי לתלמיד, להוריו ולמורים המקצועיים הרלוונטיים.
            <span className="block text-xs text-violet-700">כל הוספה, עריכה או מחיקה כאן חלה רק עליו/ה; שאר הכיתה ממשיכה כרגיל.</span></span>
        </div>
      )}

      <div className={editMode ? 'pb-32' : ''}>
        {props.view === 'day' && (
          <DayView date={props.date} occurrences={props.occurrences} calendar={props.calendar}
            onSelect={setSelected} edit={edit} onCalendarChanged={props.onChanged} />
        )}
        {props.view === 'week' && (
          <WeekView date={props.date} today={props.today} occurrences={props.occurrences} calendar={props.calendar}
            onSelect={setSelected} edit={edit} onCalendarChanged={props.onChanged} />
        )}
        {props.view === 'month' && (
          <MonthView date={props.date} today={props.today} calendar={props.calendar}
            assignments={props.assignments} events={props.events} onOpenDay={openDay} />
        )}
      </div>

      {editMode && (
        <BulkBar key={barMode} mode={barMode === 'delete' ? 'delete' : 'edit'} selected={pickedOccs} classId={props.classId}
          studentId={student?.id ?? null} studentName={student?.full_name ?? ''}
          onDone={(m) => { setPicked(new Set()); props.onChanged(); notify(m); }}
          onClear={() => setPicked(new Set())}
          onExit={() => { setBarMode('none'); setPicked(new Set()); }} />
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
          onOpenEditor={(o) => openEditor(o.date, o)}
          onClose={() => setSelected(null)}
        />
      )}
      {selected && !staff && props.studentId && (
        <RequestModal occurrence={selected} studentId={props.studentId} homeroomId={props.homeroomId}
          onChanged={props.onChanged} onClose={() => setSelected(null)} />
      )}
      {editor && (
        <EventEditor
          classes={props.editableClasses.length ? props.editableClasses : [{ id: props.classId, name: '' }]}
          initialClassId={props.classId}
          teachers={props.teachers}
          date={editor.date}
          occurrence={editor.occurrence}
          student={student}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}

      {/* כפתורים צפים (פינה שמאלית תחתונה) — מחנך / מנהל: − מחיקה מעל + הוספה */}
      {props.canEditSchedule && !editMode && !editor && !selected && props.view !== 'month' && (
        <button
          type="button"
          aria-label="מחיקת שיעורים"
          title={student ? `מחיקת שיעורים — רק עבור ${student.full_name}` : 'מחיקת שיעורים'}
          onClick={() => { setPicked(new Set()); setBarMode('delete'); }}
          className="fixed left-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-4xl font-light text-red-600 shadow-lg ring-1 ring-red-200 transition hover:bg-red-50 active:scale-95"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          −
        </button>
      )}
      {props.canEditSchedule && !editMode && !editor && !selected && (
        <button
          type="button"
          aria-label="הוספה / עריכה במערכת"
          title="הוספה / עריכה"
          onClick={() => openEditor(props.date)}
          className="fixed left-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-light text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 active:scale-95"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          +
        </button>
      )}
    </>
  );
}
