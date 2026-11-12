'use client';

import Modal from './Modal';

/** חלונית אישור מעוצבת (במקום window.confirm) */
export default function ConfirmDialog({
  title, message, confirmLabel = 'אישור', cancelLabel = 'ביטול', danger = false, pending = false, onConfirm, onCancel, children,
}: {
  title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; pending?: boolean;
  onConfirm: () => void; onCancel: () => void; children?: React.ReactNode;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      {message && <p className="text-base">{message}</p>}
      {children}
      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="btn bg-slate-100 hover:bg-slate-200" onClick={onCancel} disabled={pending}>{cancelLabel}</button>
        <button type="button" autoFocus disabled={pending} onClick={onConfirm}
          className={`btn text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'}`}>
          {pending ? 'רגע…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
