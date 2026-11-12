// כל התאריכים מיוצגים כמחרוזות 'YYYY-MM-DD' ומחושבים ב-UTC
// כדי להימנע מתקלות אזורי זמן / שעון קיץ.
import type { View } from './types';

export const SCHOOL_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'] as const;

export const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number) {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function addMonths(iso: string, n: number) {
  const d = parse(iso);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return fmt(d);
}

/** 0=ראשון ... 6=שבת */
export const jsDow = (iso: string) => parse(iso).getUTCDay();

/** 1..5 עבור ראשון..חמישי, אחרת null */
export function schoolDow(iso: string): number | null {
  const d = jsDow(iso);
  return d <= 4 ? d + 1 : null;
}

export const isValidISO = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

/** אם התאריך נופל על שישי/שבת — קופץ ליום הלימודים הבא (או הקודם) */
export function toSchoolDay(iso: string, direction: 1 | -1 = 1) {
  let d = iso;
  while (jsDow(d) >= 5) d = addDays(d, direction);
  return d;
}

export const weekStart = (iso: string) => addDays(iso, -jsDow(iso));
export const weekDates = (iso: string) => [0, 1, 2, 3, 4].map((i) => addDays(weekStart(iso), i));

/** גריד חודשי: מערך שבועות, כל שבוע = 5 תאריכים (ראשון–חמישי) */
export function monthGrid(iso: string): string[][] {
  const first = `${iso.slice(0, 7)}-01`;
  const month = iso.slice(5, 7);
  const weeks: string[][] = [];
  let start = weekStart(first);
  while (true) {
    const week = [0, 1, 2, 3, 4].map((i) => addDays(start, i));
    if (!week.some((d) => d.slice(5, 7) === month)) break;
    weeks.push(week);
    start = addDays(start, 7);
  }
  return weeks;
}

export function rangeFor(view: View, iso: string) {
  if (view === 'day') return { from: iso, to: iso };
  if (view === 'week') { const w = weekDates(iso); return { from: w[0], to: w[4] }; }
  const g = monthGrid(iso);
  return { from: g[0][0], to: g[g.length - 1][4] };
}

export function navigate(view: View, iso: string, dir: 1 | -1) {
  if (view === 'day') return toSchoolDay(addDays(iso, dir), dir);
  if (view === 'week') return addDays(iso, 7 * dir);
  return toSchoolDay(addMonths(iso, dir));
}

export function heDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', ...opts }).format(parse(iso));
}

export function rangeTitle(view: View, iso: string) {
  if (view === 'day') return heDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'week') {
    const w = weekDates(iso);
    return `${heDate(w[0], { day: 'numeric', month: 'short' })} – ${heDate(w[4], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return heDate(iso, { month: 'long', year: 'numeric' });
}

export const hhmm = (t: string) => t.slice(0, 5);
