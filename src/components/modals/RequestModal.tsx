'use client';

import { useState, useTransition } from 'react';
import Modal from '../ui/Modal';
import { submitRequest } from '@/lib/api';
import { getSupabase } from '@/lib/supabase/client';
import { heDate, hhmm } from '@/lib/dates';
import type { Occurrence, RequestKind } from '@/lib/types';
import { ASSIGNMENT_LABEL, EXCEPTION_LABEL, EXCEPTION_STATUS_LABEL, REQUEST_KIND_LABEL } from '@/lib/types';

/** תלמיד/הורה: צפייה בפרטי השיעור + שליחת בקשה ישירה למורה */
export default function RequestModal({
  occurrence: occ, studentId, onChanged, onClose,
}: { occurrence: Occurrence; studentId: string; onChanged: () => void; onClose: () => void }) {
  const [pending, start] = useTransition();
  const events = occ.events.filter((e) => !e.retracted);
  const [eventId, setEventId] = useState<string>(events[0]?.id ?? '');
  const ev = events.find((e) => e.id === eventId);
  const defaultKind: RequestKind = ev ? (ev.type === 'absence' || ev.type === 'late' ? 'justify_absence' : 'appeal_note') : 'other';
  const [kind, setKind] = useState<RequestKind>(defaultKind);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () =>
    start(async () => {
      let attachmentPath: string | null = null;
      if (file) {
        // נתיב מתחיל ב-studentId — נאכף ע"י מדיניות ה-Storage
        const path = `${studentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
        const { error } = await getSupabase().storage.from('request-attachments').upload(path, file);
        if (error) { setMsg({ ok: false, text: 'העלאת הקובץ נכשלה' }); return; }
        attachmentPath = path;
      }
      const r = await submitRequest({
        studentId, teacherId: occ.teacherId, kind, message, eventId: eventId || null,
        lessonId: occ.lesson.id, lessonDate: occ.date, attachmentPath,
      });
      if (r.ok) { setMsg({ ok: true, text: 'הבקשה נשלחה למורה' }); setMessage(''); setFile(null); onChanged(); }
      else setMsg({ ok: false, text: r.error });
    });

  return (
    <Modal
      title={occ.lesson.subject}
      subtitle={`${heDate(occ.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${hhmm(occ.start)}–${hhmm(occ.end)} · ${occ.teacherName}`}
      onClose={onClose}
    >
      {occ.assignments.length > 0 && (
        <section className="mb-4 space-y-2">
          {occ.assignments.map((a) => (
            <div key={a.id} className="rounded-lg bg-sky-50 p-2 text-sm">
              <div className="font-medium">{ASSIGNMENT_LABEL[a.type]}: {a.title}</div>
              {a.description && <p className="mt-0.5 whitespace-pre-line text-slate-600">{a.description}</p>}
            </div>
          ))}
        </section>
      )}

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {events.length > 0 && (
          <div>
            <label className="label" htmlFor="rq-ev">בנוגע להערה</label>
            <select id="rq-ev" className="input" value={eventId} onChange={(e) => {
              setEventId(e.target.value);
              const t = events.find((x) => x.id === e.target.value)?.type;
              setKind(!t ? 'other' : t === 'absence' || t === 'late' ? 'justify_absence' : 'appeal_note');
            }}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {EXCEPTION_LABEL[e.type]}{e.status ? ` (${EXCEPTION_STATUS_LABEL[e.status]})` : ''}{e.note ? ` — ${e.note}` : ''}
                </option>
              ))}
              <option value="">שאלה כללית על השיעור</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="rq-kind">סוג בקשה</label>
          <select id="rq-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
            {(Object.keys(REQUEST_KIND_LABEL) as RequestKind[]).map((k) => <option key={k} value={k}>{REQUEST_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rq-msg">הודעה למורה</label>
          <textarea id="rq-msg" className="input" rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="rq-file">צירוף אישור (אופציונלי)</label>
          <input id="rq-file" type="file" accept="image/*,application/pdf" className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span role="status" className={`text-sm ${msg?.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg?.text}</span>
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'שולח…' : 'שליחה'}</button>
        </div>
      </form>
    </Modal>
  );
}
