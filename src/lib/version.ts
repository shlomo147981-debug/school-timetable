// גרסת האפליקציה + בדיקת עדכונים מול GitHub Pages (OTA ללא התקנת APK מחדש).
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const APP_BUILD = Number(process.env.NEXT_PUBLIC_APP_BUILD ?? 0);
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? 'dev';

/** כתובת הגרסה המקוונת (GitHub Pages) */
export const REMOTE_APP_URL = 'https://shlomo147981-debug.github.io/school-timetable/';

export interface RemoteVersion { version: string; build: number; commit: string; date: string }

export const buildDate = (build: number) =>
  build ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(build * 1000)) : '—';

/** האם רצים מתוך GitHub Pages (הגרסה המקוונת) */
export const isRemoteCopy = () => typeof location !== 'undefined' && location.hostname.endsWith('github.io');

/** בודק מה הגרסה האחרונה שפורסמה. null = אין חיבור / Pages לא מוגדר. */
export async function fetchRemoteVersion(timeoutMs = 5000): Promise<RemoteVersion | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${REMOTE_APP_URL}version.json?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    const v = (await res.json()) as RemoteVersion;
    return typeof v.build === 'number' ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * מעבר לגרסה המקוונת תוך העברת הסשן (ב-hash — לא נשלח לשום שרת),
 * כדי שהמשתמש לא יצטרך להתחבר שוב.
 */
export function goToRemote(tokens?: { access_token: string; refresh_token: string } | null, build?: number) {
  const url = new URL(REMOTE_APP_URL);
  url.search = location.search;
  if (build) url.searchParams.set('v', String(build));
  if (tokens) url.hash = `at=${encodeURIComponent(tokens.access_token)}&rt=${encodeURIComponent(tokens.refresh_token)}`;
  location.replace(url.toString());
}
