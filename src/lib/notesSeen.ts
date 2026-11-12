// "נקרא עד" — זמן הצפייה האחרונה במסך ההערות, לכל משתמש (נשמר מקומית במכשיר)
const key = (uid: string) => `notes-seen-${uid}`;

export function getNotesSeen(uid: string): string {
  try { return localStorage.getItem(key(uid)) ?? new Date(Date.now() - 7 * 864e5).toISOString(); }
  catch { return new Date(Date.now() - 7 * 864e5).toISOString(); }
}

export function setNotesSeen(uid: string, iso = new Date().toISOString()) {
  try { localStorage.setItem(key(uid), iso); } catch { /* ignore */ }
  window.dispatchEvent(new Event('notes-seen'));
}
