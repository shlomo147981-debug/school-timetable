'use client';

// אפליקציה בעמוד יחיד (SPA): כל המסכים תחת "/", ניווט ב-React State + hash (#page=requests&view=month).
// בלי router של Next ובלי טעינה מחדש — עובד זהה ב-GitHub Pages (/school-timetable/) וב-Capacitor.
import { Suspense } from 'react';
import { NavProvider, useNav } from '@/lib/nav';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import LoginScreen from '@/components/screens/LoginScreen';
import AppShell from '@/components/screens/AppShell';
import ScheduleScreen from '@/components/screens/ScheduleScreen';
import RequestsScreen from '@/components/screens/RequestsScreen';
import AdminScreen from '@/components/screens/AdminScreen';
import NotesScreen from '@/components/screens/NotesScreen';
import OtaGate from '@/components/OtaGate';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">🔔</div>
    </div>
  );
}

function AppRoot() {
  const { auth } = useAuth();
  const { params } = useNav();
  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signed_out') return <LoginScreen initialError={auth.error} />;

  const p = params.get('page');
  const staff = auth.profile.role === 'teacher' || auth.profile.role === 'homeroom' || auth.profile.is_admin;
  const page = p === 'requests' ? 'requests' : p === 'admin' && auth.profile.is_admin ? 'admin' : p === 'notes' && staff ? 'notes' : 'schedule';
  return (
    <AppShell profile={auth.profile} page={page}>
      {page === 'requests' ? <RequestsScreen profile={auth.profile} />
        : page === 'admin' ? <AdminScreen me={auth.profile} />
        : page === 'notes' ? <NotesScreen me={auth.profile} />
        : <ScheduleScreen key={auth.profile.id} profile={auth.profile} />}
    </AppShell>
  );
}

export default function Page() {
  return (
    <OtaGate>
      <NavProvider>
        <AuthProvider>
          <Suspense fallback={<Splash />}>
            <AppRoot />
          </Suspense>
        </AuthProvider>
      </NavProvider>
    </OtaGate>
  );
}
