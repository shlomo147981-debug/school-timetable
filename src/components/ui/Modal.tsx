'use client';

import { useEffect, useRef } from 'react';

export default function Modal({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="w-[min(100%-2rem,32rem)] rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between border-b border-slate-200 p-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <button className="btn-ghost -m-1 px-2" onClick={onClose} aria-label="סגירה">✕</button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
