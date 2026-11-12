'use client';

export type SpecialPreset = 'trip' | 'peak' | 'custom';
export interface SpecialValue { preset: SpecialPreset; text: string }

const PRESETS: { id: SpecialPreset; label: string; icon: string }[] = [
  { id: 'trip', label: 'טיול', icon: '🚌' },
  { id: 'peak', label: 'יום שיא', icon: '🎉' },
  { id: 'custom', label: 'בחירה אישית', icon: '✏️' },
];

/** הכותרת שתוצג במערכת לתלמידים ולהורים. null = חסר טקסט בבחירה אישית */
export function specialTitle(v: SpecialValue): string | null {
  const t = v.text.trim();
  if (v.preset === 'custom') return t || null;
  const base = v.preset === 'trip' ? 'טיול' : 'יום שיא';
  return t ? `${base}: ${t}` : base;
}

/** סוג אירוע ללוח החודשי (בחירה אישית — ללא אירוע לוח) */
export const specialCalendarKind = (v: SpecialValue) => (v.preset === 'trip' ? 'trip' : v.preset === 'peak' ? 'event' : null);

export default function SpecialActivityPicker({ value, onChange }: { value: SpecialValue; onChange: (v: SpecialValue) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => onChange({ ...value, preset: p.id })}
            className={`rounded-lg border px-2 py-2 text-sm ${value.preset === p.id ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200 bg-white'}`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>
      <input
        className="input"
        aria-label={value.preset === 'custom' ? 'תיאור הפעילות או הסיבה' : 'פרטים נוספים (אופציונלי)'}
        placeholder={value.preset === 'custom' ? 'מה הפעילות / הסיבה? למשל: הצגה באשכול פיס' : 'פרטים נוספים (אופציונלי), למשל: טיול שנתי לגליל'}
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
    </div>
  );
}
