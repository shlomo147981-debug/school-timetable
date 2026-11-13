// צבעי תצוגה לשיעור/אירוע (נשמרים כמזהה טקסט ב-lessons.color / lesson_changes.new_color)
export interface ColorDef { id: string; label: string; dot: string; card: string }

export const COLORS: ColorDef[] = [
  { id: 'blue',   label: 'כחול',  dot: 'bg-blue-500',    card: 'border-s-4 border-s-blue-500 bg-blue-50' },
  { id: 'green',  label: 'ירוק',  dot: 'bg-emerald-500', card: 'border-s-4 border-s-emerald-500 bg-emerald-50' },
  { id: 'red',    label: 'אדום',  dot: 'bg-red-500',     card: 'border-s-4 border-s-red-500 bg-red-50' },
  { id: 'orange', label: 'כתום',  dot: 'bg-orange-500',  card: 'border-s-4 border-s-orange-500 bg-orange-50' },
  { id: 'yellow', label: 'צהוב',  dot: 'bg-yellow-400',  card: 'border-s-4 border-s-yellow-400 bg-yellow-50' },
  { id: 'purple', label: 'סגול',  dot: 'bg-violet-500',  card: 'border-s-4 border-s-violet-500 bg-violet-50' },
  { id: 'pink',   label: 'ורוד',  dot: 'bg-pink-500',    card: 'border-s-4 border-s-pink-500 bg-pink-50' },
  { id: 'teal',   label: 'טורקיז', dot: 'bg-teal-500',   card: 'border-s-4 border-s-teal-500 bg-teal-50' },
  { id: 'gray',   label: 'אפור',  dot: 'bg-slate-500',   card: 'border-s-4 border-s-slate-500 bg-slate-100' },
];

export const colorDef = (id: string | null | undefined) => COLORS.find((c) => c.id === id) ?? null;
