// יוצר משתמשי דמו + כיתה + מערכת שבועית. הרצה: npm run seed
// דורש SUPABASE_SERVICE_ROLE_KEY ב-.env.local (עוקף RLS — לשימוש מנהל בלבד!)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const domain = process.env.NEXT_PUBLIC_LOGIN_DOMAIN ?? 'school.local';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const PASSWORD = 'Demo1234!';

async function user(username, full_name, role, class_id = null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${domain}`, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`${username}: ${error.message}`);
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, username, full_name, role, class_id });
  if (e2) throw e2;
  return data.user.id;
}
const must = ({ data, error }) => { if (error) throw error; return data; };

const existing = await admin.from('classes').select('id').limit(1);
if (existing.error) {
  console.error('✖ הטבלאות לא קיימות עדיין. הריצו קודם את supabase/SETUP_ALL.sql ב-SQL Editor.\n ', existing.error.message);
  process.exit(1);
}
if (existing.data.length) {
  console.log('ℹ כבר קיימים נתונים (classes לא ריקה) — דילוג על seed.');
  process.exit(0);
}

const [cls] = must(await admin.from('classes').insert({ name: "ט'2", grade: 9 }).select());
const [cls2] = must(await admin.from('classes').insert({ name: "ז'1", grade: 7 }).select());

const homeroom = await user('h100', 'רונית כהן', 'homeroom', cls.id);
const math = await user('t200', 'אבי לוי', 'teacher');
const eng = await user('t201', 'שירה מזרחי', 'teacher');
must(await admin.from('classes').update({ homeroom_teacher_id: homeroom }).eq('id', cls.id));

const s1 = await user('s300', 'נועה ישראלי', 'student', cls.id);
const s2 = await user('s301', 'יואב פרץ', 'student', cls.id);
const s3 = await user('s302', 'דניאל אברהם', 'student', cls.id);
const s4 = await user('s303', 'מיה ישראלי', 'student', cls2.id); // אחות של נועה בכיתה אחרת
const parent = await user('p400', 'משה ישראלי', 'parent');
must(await admin.from('parent_children').insert([
  { parent_id: parent, student_id: s1 }, { parent_id: parent, student_id: s4 },
]));

const P = [['08:00', '08:45'], ['08:50', '09:35'], ['09:55', '10:40'], ['10:45', '11:30'], ['11:50', '12:35'], ['12:40', '13:25']];
const plan = {
  1: [['מתמטיקה', math], ['מתמטיקה', math], ['אנגלית', eng], ['תנ"ך', homeroom], ['היסטוריה', homeroom]],
  2: [['אנגלית', eng], ['מתמטיקה', math], ['ספרות', homeroom], ['חינוך', homeroom]],
  3: [['מתמטיקה', math], ['אנגלית', eng], ['אנגלית', eng], ['תנ"ך', homeroom], ['ספורט', homeroom], ['ספורט', homeroom]],
  4: [['היסטוריה', homeroom], ['מתמטיקה', math], ['אנגלית', eng], ['ספרות', homeroom]],
  5: [['מתמטיקה', math], ['תנ"ך', homeroom], ['אנגלית', eng]],
};
const rows = [];
for (const [day, lessons] of Object.entries(plan)) {
  lessons.forEach(([subject, teacher_id], i) =>
    rows.push({ class_id: cls.id, teacher_id, subject, room: `${100 + i}`, day_of_week: +day, start_time: P[i][0], end_time: P[i][1] }));
}
// שיעור אישי: תגבור מתמטיקה לנועה
rows.push({ class_id: cls.id, teacher_id: math, student_id: s1, subject: 'תגבור מתמטיקה', room: '210', day_of_week: 2, start_time: '13:30', end_time: '14:15' });
// מערכת בסיסית לכיתה ז'1
rows.push({ class_id: cls2.id, teacher_id: eng, subject: 'אנגלית', room: '12', day_of_week: 1, start_time: '08:00', end_time: '08:45' });
must(await admin.from('lessons').insert(rows));

console.log(`✔ seed הושלם. סיסמה לכל המשתמשים: ${PASSWORD}
  מחנכת: h100 | מורים: t200, t201 | תלמידים: s300, s301, s302, s303 | הורה (2 ילדים): p400`);
